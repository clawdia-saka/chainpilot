/**
 * Reporter — Telegram notification formatter for ChainPilot
 *
 * Produces structured, human-readable Telegram messages that include:
 *   - Reasoning (why each chain was chosen / skipped)
 *   - Route comparison (bridge used, cost, slippage, duration)
 *   - Portfolio state (before/after balances, target weights)
 *   - Guardrail status (which rules were checked and whether they passed)
 *
 * All functions return plain strings. The caller (index.ts or executeMove)
 * is responsible for sending them via notify().
 */

import type { AllocationPlan, ChainAllocation, RebalancingMove } from './allocator.js';
import type { GuardrailReport, GuardrailCheck } from './guardrails.js';
import type { Portfolio } from './allocator.js';
import type { GetQuoteResponse } from '../lifi/types.js';
import { GUARDRAILS } from '../config.js';

// ─── Formatting helpers ────────────────────────────────────────────────────────

function usd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function bar(fraction: number, width = 10): string {
  const filled = Math.round(Math.min(Math.max(fraction, 0), 1) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function ruleIcon(check: GuardrailCheck): string {
  return check.status === 'PASS' ? '✅' : '❌';
}

// ─── Sub-formatters ───────────────────────────────────────────────────────────

/**
 * Format the allocation reasoning section.
 * Explains why each chain received its weight.
 */
function formatReasoning(plan: AllocationPlan): string {
  const candidates = plan.allocations.filter((a) => a.adjustedScore > 0);
  const held = plan.allocations.filter((a) => a.adjustedScore === 0 && a.currentUsd > 0);

  const lines: string[] = ['📊 *Allocation Reasoning*'];

  if (candidates.length === 0) {
    lines.push('No chains met the confidence threshold — holding current positions.');
    return lines.join('\n');
  }

  for (const alloc of [...candidates].sort((a, b) => b.adjustedScore - a.adjustedScore)) {
    const weightBar = bar(alloc.targetWeight);
    const delta = alloc.deltaUsd > 0.01
      ? `▲ ${usd(alloc.deltaUsd)}`
      : alloc.deltaUsd < -0.01
        ? `▼ ${usd(Math.abs(alloc.deltaUsd))}`
        : '≈ balanced';

    lines.push(
      `\n• *${alloc.chainName}* — score ${alloc.adjustedScore.toFixed(3)}` +
      `\n  Target: ${pct(alloc.targetWeight)} [${weightBar}]` +
      `\n  Now: ${usd(alloc.currentUsd)} → Goal: ${usd(alloc.targetUsd)} (${delta})`,
    );
  }

  if (held.length > 0) {
    lines.push('\n⏸ Chains with existing balance but no allocation signal:');
    for (const alloc of held) {
      lines.push(`  • ${alloc.chainName}: ${usd(alloc.currentUsd)} (will be redeployed)`);
    }
  }

  const skipped = plan.allocations.filter((a) => a.adjustedScore === 0 && a.currentUsd === 0);
  if (skipped.length > 0) {
    lines.push('\n⛔ Chains below confidence threshold: ' + skipped.map((a) => a.chainName).join(', '));
  }

  return lines.join('\n');
}

/**
 * Format a route comparison block for a single move's quote.
 */
function formatRouteComparison(
  move: RebalancingMove,
  quote: GetQuoteResponse,
): string {
  const estimate = quote.estimate;

  const fromAmtUsd = Number(quote.action.fromAmount) / 1e6; // USDC has 6 decimals
  const toAmtUsd = Number(estimate.toAmount) / 1e6;
  const toAmtMinUsd = Number(estimate.toAmountMin) / 1e6;
  const effectiveSlippage = toAmtUsd > 0 ? (toAmtUsd - toAmtMinUsd) / toAmtUsd : 0;

  const totalGasUsd = estimate.gasCosts
    .reduce((sum, g) => sum + Number(g.amountUSD ?? '0'), 0);
  const totalFeeUsd = estimate.feeCosts
    .filter((f) => !f.included)
    .reduce((sum, f) => sum + Number(f.amountUSD ?? '0'), 0);

  const durationMin = Math.ceil(estimate.executionDuration / 60);
  const received = usd(toAmtUsd);
  const worst = usd(toAmtMinUsd);

  const lines: string[] = [
    `🔀 *Route: ${move.fromChainName} → ${move.toChainName}*`,
    `  Bridge/DEX: ${quote.tool}`,
    `  Sending:  ${usd(fromAmtUsd)} USDC`,
    `  Expected: ${received} USDC (worst-case: ${worst})`,
    `  Slippage: ${pct(effectiveSlippage)} (limit: ${pct(GUARDRAILS.MAX_SLIPPAGE)})`,
    `  Gas:  ${usd(totalGasUsd)}${totalFeeUsd > 0 ? `  |  Protocol fee: ${usd(totalFeeUsd)}` : ''}`,
    `  ETA: ~${durationMin} min`,
  ];

  return lines.join('\n');
}

/**
 * Format the portfolio state (before/after rebalance).
 */
function formatPortfolioState(
  plan: AllocationPlan,
  portfolio: Portfolio,
  label = 'Portfolio Snapshot',
): string {
  const lines: string[] = [`💼 *${label}*`, `  Total: ${usd(plan.totalPortfolioUsd)}`];

  const sorted = [...plan.allocations].sort((a, b) => b.currentUsd - a.currentUsd);
  for (const alloc of sorted) {
    const currentPct = plan.totalPortfolioUsd > 0
      ? alloc.currentUsd / plan.totalPortfolioUsd
      : 0;
    const targetPct = alloc.targetWeight;
    const currentBar = bar(currentPct, 8);
    const arrow = Math.abs(targetPct - currentPct) < 0.005
      ? '→'
      : targetPct > currentPct
        ? '↑'
        : '↓';

    lines.push(
      `  ${alloc.chainName.padEnd(10)} ` +
      `${usd(alloc.currentUsd).padStart(7)} [${currentBar}] ` +
      `${pct(currentPct).padStart(6)} ${arrow} ${pct(targetPct).padStart(6)}`,
    );
  }

  return lines.join('\n');
}

/**
 * Format guardrail check results compactly.
 */
function formatGuardrailSummary(report: GuardrailReport): string {
  const status = report.passed ? '✅ All guardrails passed' : '⚠️ Guardrail violations detected';
  const lines: string[] = [`🛡 *Guardrails* — ${status}`];

  // Deduplicate by rule (show worst result per rule)
  const ruleMap = new Map<string, GuardrailCheck>();
  for (const check of report.checks) {
    const existing = ruleMap.get(check.rule);
    if (!existing || check.status === 'FAIL') {
      ruleMap.set(check.rule, check);
    }
  }

  for (const check of ruleMap.values()) {
    lines.push(`  ${ruleIcon(check)} ${check.rule}: ${check.message}`);
  }

  if (report.blockedMoves.length > 0) {
    lines.push(`  ⛔ ${report.blockedMoves.length} move(s) blocked`);
  }

  return lines.join('\n');
}

// ─── Public formatters ────────────────────────────────────────────────────────

/**
 * Format the cycle-start notification.
 */
export function formatCycleStart(runAt: string, portfolio: Portfolio): string {
  const total = Object.values(portfolio).reduce((s, v) => s + (v ?? 0), 0);
  return (
    `🤖 *ChainPilot cycle starting*\n` +
    `Time: ${runAt}\n` +
    `Portfolio: ${usd(total)} USDC across ${Object.keys(portfolio).length} chain(s)`
  );
}

/**
 * Format the full decision report (after planning, before execution).
 * Includes reasoning, portfolio state, guardrail status.
 */
export function formatDecisionReport(
  plan: AllocationPlan,
  portfolio: Portfolio,
  guardrailReport: GuardrailReport,
): string {
  const sections: string[] = [
    `📋 *ChainPilot Decision Report*`,
    `Generated: ${plan.createdAt}`,
    `Data quality: ${plan.dataQualityOk ? '✅ OK' : '⚠️ Degraded'}`,
    '',
    formatReasoning(plan),
    '',
    formatPortfolioState(plan, portfolio),
    '',
    formatGuardrailSummary(guardrailReport),
    '',
    `Moves queued: ${guardrailReport.allowedMoves.length} of ${plan.moves.length}`,
  ];

  return sections.join('\n');
}

/**
 * Format a single move's pre-execution notification.
 * Call this just before sending the transaction.
 */
export function formatMoveStart(
  move: RebalancingMove,
  quote: GetQuoteResponse,
  moveIndex: number,
  totalMoves: number,
): string {
  return (
    `🚀 *Move ${moveIndex}/${totalMoves}*\n` +
    `${move.fromChainName} → ${move.toChainName}  ${usd(move.amountUsd)} USDC\n` +
    `Reason: ${move.rationale}\n\n` +
    formatRouteComparison(move, quote)
  );
}

/**
 * Format a single move's completion notification.
 */
export function formatMoveComplete(
  move: RebalancingMove,
  txHash: string,
  statusLabel: string,
  success: boolean,
): string {
  const icon = success ? '✅' : '❌';
  return (
    `${icon} *Move complete*\n` +
    `${move.fromChainName} → ${move.toChainName}  ${usd(move.amountUsd)} USDC\n` +
    `Status: ${statusLabel}\n` +
    `Tx: \`${txHash}\``
  );
}

/**
 * Format the end-of-cycle summary report.
 * Includes move outcomes, updated portfolio, and guardrail status.
 */
export interface MoveOutcome {
  move: RebalancingMove;
  success: boolean;
  txHash?: string;
  statusLabel?: string;
  error?: string;
  quote?: GetQuoteResponse;
}

export function formatCycleSummary(
  plan: AllocationPlan,
  portfolio: Portfolio,
  outcomes: MoveOutcome[],
  guardrailReport: GuardrailReport,
): string {
  const succeeded = outcomes.filter((o) => o.success).length;
  const failed = outcomes.filter((o) => !o.success).length;
  const blocked = guardrailReport.blockedMoves.length;

  const moveLines = outcomes.map((o) => {
    const icon = o.success ? '✅' : '❌';
    const detail = o.statusLabel
      ? o.statusLabel
      : o.error
        ? `err: ${o.error.slice(0, 40)}`
        : 'unknown';
    return `  ${icon} ${usd(o.move.amountUsd)} ${o.move.fromChainName}→${o.move.toChainName} (${detail})`;
  });

  const sections: string[] = [
    `📊 *ChainPilot Cycle Complete*`,
    `  ✅ ${succeeded} succeeded  ❌ ${failed} failed  ⛔ ${blocked} blocked`,
    `  Portfolio: ${usd(plan.totalPortfolioUsd)} USDC`,
    '',
  ];

  if (moveLines.length > 0) {
    sections.push('*Moves:*');
    sections.push(...moveLines);
    sections.push('');
  }

  // Route comparison for successful moves
  const successWithQuotes = outcomes.filter((o) => o.success && o.quote);
  if (successWithQuotes.length > 0) {
    sections.push('*Routes used:*');
    for (const o of successWithQuotes) {
      sections.push(formatRouteComparison(o.move, o.quote!));
    }
    sections.push('');
  }

  sections.push(formatPortfolioState(plan, portfolio, 'Final Portfolio'));
  sections.push('');
  sections.push(formatGuardrailSummary(guardrailReport));
  sections.push('');
  sections.push(plan.summary);

  return sections.join('\n');
}

/**
 * Format a data-quality abort notification.
 */
export function formatDataQualityAbort(plan: AllocationPlan): string {
  return (
    `⚠️ *ChainPilot: data quality check failed — skipping execution*\n\n` +
    plan.summary
  );
}

/**
 * Format a no-moves-needed notification.
 */
export function formatNoMovesNeeded(plan: AllocationPlan, portfolio: Portfolio): string {
  return (
    `ℹ️ *ChainPilot: no moves needed*\n\n` +
    formatPortfolioState(plan, portfolio, 'Current Portfolio') +
    '\n\n' +
    plan.summary
  );
}
