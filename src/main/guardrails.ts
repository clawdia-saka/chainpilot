/**
 * Guardrails — hard rule enforcement for ChainPilot
 *
 * Enforces SPEC.md constraints BEFORE any move is executed:
 *   - MAX_CHAIN_ALLOCATION: no single chain may hold >40% of portfolio
 *   - MAX_TX_USD: no single transaction may exceed $20
 *   - MAX_MOVES_PER_DAY: at most 6 moves per 24h window
 *   - MAX_SLIPPAGE: at most 1.5% slippage accepted on any route
 *
 * All checks return a typed result so callers can log and act on violations
 * rather than receiving silent failures.
 */

import { GUARDRAILS } from '../config.js';
import type { TargetChainId } from '../config.js';
import type { RebalancingMove, AllocationPlan, Portfolio } from './allocator.js';
import type { GetQuoteResponse } from '../lifi/types.js';

// ─── Result types ─────────────────────────────────────────────────────────────

export type GuardrailStatus = 'PASS' | 'FAIL';

export interface GuardrailCheck {
  rule: string;
  status: GuardrailStatus;
  /** Human-readable description of the check result */
  message: string;
  /** Actual value that was tested */
  actual: number | string;
  /** Limit that must not be exceeded */
  limit: number | string;
}

export interface GuardrailReport {
  passed: boolean;
  checks: GuardrailCheck[];
  /** Moves that survived all guardrail filters */
  allowedMoves: RebalancingMove[];
  /** Moves that were blocked */
  blockedMoves: Array<{ move: RebalancingMove; reason: string }>;
}

// ─── Individual rule checks ───────────────────────────────────────────────────

/**
 * Verify a single move does not exceed MAX_TX_USD.
 */
export function checkTxLimit(move: RebalancingMove): GuardrailCheck {
  const rule = 'MAX_TX_USD';
  const limit = GUARDRAILS.MAX_TX_USD;
  const actual = move.amountUsd;

  if (actual > limit) {
    return {
      rule,
      status: 'FAIL',
      message: `Move $${actual.toFixed(2)} from ${move.fromChainName}→${move.toChainName} exceeds $${limit} limit`,
      actual,
      limit,
    };
  }

  return {
    rule,
    status: 'PASS',
    message: `$${actual.toFixed(2)} ≤ $${limit} ✓`,
    actual,
    limit,
  };
}

/**
 * Verify a LI.FI quote's slippage does not exceed MAX_SLIPPAGE.
 * Slippage is computed from the quote's toAmount vs toAmountMin.
 *
 * Blue Team fix003: Uses BigInt integer arithmetic throughout to avoid
 * Number() precision loss for 18-decimal tokens. At typical prices a $20
 * ETH transfer is ~1×10^16 wei, which exceeds Number.MAX_SAFE_INTEGER
 * (9×10^15). Independently converting toAmt and toAmtMin via Number()
 * introduces independent rounding errors that can cause the computed
 * slippage to be off by several ULP — masking a real violation or
 * triggering a false one. BigInt basis-point arithmetic is exact.
 */
export function checkSlippage(quote: GetQuoteResponse): GuardrailCheck {
  const rule = 'MAX_SLIPPAGE';
  const limit = GUARDRAILS.MAX_SLIPPAGE;

  // Parse amounts as BigInt — amounts are wei strings, always integers
  let toAmtBig: bigint;
  let toAmtMinBig: bigint;

  try {
    toAmtBig = BigInt(quote.estimate.toAmount);
    toAmtMinBig = BigInt(quote.estimate.toAmountMin);
  } catch {
    return {
      rule,
      status: 'FAIL',
      message: 'Quote amounts are non-integer or missing — rejecting for safety',
      actual: 'invalid',
      limit,
    };
  }

  if (toAmtBig <= 0n) {
    return {
      rule,
      status: 'FAIL',
      message: 'Quote toAmount is zero — rejecting for safety',
      actual: 'zero',
      limit,
    };
  }

  // Slippage in basis points (integer arithmetic):
  //   slippageBps = (toAmt - toAmtMin) * 10_000 / toAmt
  // MAX_SLIPPAGE_BPS = round(limit * 10_000), e.g. 0.015 → 150 bps
  // Comparison is exact: no epsilon needed.
  const MAX_SLIPPAGE_BPS = BigInt(Math.round(limit * 10_000));
  const slippageBps = (toAmtBig - toAmtMinBig) * 10_000n / toAmtBig;

  // Convert back to float for human-readable display only
  const effectiveSlippage = Number(slippageBps) / 10_000;

  if (slippageBps > MAX_SLIPPAGE_BPS) {
    return {
      rule,
      status: 'FAIL',
      message:
        `Slippage ${(effectiveSlippage * 100).toFixed(3)}% (${slippageBps} bps) exceeds ` +
        `${(limit * 100).toFixed(1)}% maximum (${MAX_SLIPPAGE_BPS} bps)`,
      actual: effectiveSlippage,
      limit,
    };
  }

  return {
    rule,
    status: 'PASS',
    message:
      `Slippage ${(effectiveSlippage * 100).toFixed(3)}% (${slippageBps} bps) ≤ ` +
      `${(limit * 100).toFixed(1)}% (${MAX_SLIPPAGE_BPS} bps) ✓`,
    actual: effectiveSlippage,
    limit,
  };
}

/**
 * Verify a proposed portfolio weight for a chain does not exceed MAX_CHAIN_ALLOCATION.
 * targetWeight is a fraction in [0, 1].
 */
export function checkChainAllocation(
  chainId: TargetChainId,
  chainName: string,
  targetWeight: number,
): GuardrailCheck {
  const rule = 'MAX_CHAIN_ALLOCATION';
  const limit = GUARDRAILS.MAX_CHAIN_ALLOCATION;

  if (targetWeight > limit + 1e-9) {
    return {
      rule,
      status: 'FAIL',
      message:
        `${chainName} target weight ${(targetWeight * 100).toFixed(1)}% ` +
        `exceeds ${(limit * 100).toFixed(0)}% cap`,
      actual: targetWeight,
      limit,
    };
  }

  return {
    rule,
    status: 'PASS',
    message: `${chainName} ${(targetWeight * 100).toFixed(1)}% ≤ ${(limit * 100).toFixed(0)}% ✓`,
    actual: targetWeight,
    limit,
  };
}

/**
 * Verify the total number of moves in a plan does not exceed MAX_MOVES_PER_DAY.
 * `executedToday` is the count of moves already executed in the current UTC day.
 */
export function checkMovesPerDay(
  plannedMoves: number,
  executedToday = 0,
): GuardrailCheck {
  const rule = 'MAX_MOVES_PER_DAY';
  const limit = GUARDRAILS.MAX_MOVES_PER_DAY;
  const total = executedToday + plannedMoves;

  if (total > limit) {
    const allowed = Math.max(limit - executedToday, 0);
    return {
      rule,
      status: 'FAIL',
      message:
        `${plannedMoves} planned + ${executedToday} already executed = ${total} ` +
        `exceeds daily limit of ${limit}. Only ${allowed} more move(s) allowed today.`,
      actual: total,
      limit,
    };
  }

  return {
    rule,
    status: 'PASS',
    message: `${total} total moves (${executedToday} executed + ${plannedMoves} planned) ≤ ${limit} ✓`,
    actual: total,
    limit,
  };
}

// ─── Plan-level validation ────────────────────────────────────────────────────

/**
 * Run all static guardrail checks against an AllocationPlan.
 * Does not check slippage (requires live quote data).
 *
 * @param plan            The allocation plan to validate
 * @param executedToday   Number of moves already executed in this UTC day
 */
export function validatePlan(
  plan: AllocationPlan,
  executedToday = 0,
): GuardrailReport {
  const checks: GuardrailCheck[] = [];
  const allowedMoves: RebalancingMove[] = [];
  const blockedMoves: Array<{ move: RebalancingMove; reason: string }> = [];

  // ── 1. Chain allocation cap ─────────────────────────────────────────────────
  for (const alloc of plan.allocations) {
    const check = checkChainAllocation(alloc.chainId, alloc.chainName, alloc.targetWeight);
    checks.push(check);
    // (allocation violations are advisory — the allocator already caps them,
    //  but we log any that slip through)
  }

  // ── 2. Per-move tx limit ────────────────────────────────────────────────────
  for (const move of plan.moves) {
    const txCheck = checkTxLimit(move);
    checks.push(txCheck);

    if (txCheck.status === 'FAIL') {
      blockedMoves.push({ move, reason: txCheck.message });
    } else {
      allowedMoves.push(move);
    }
  }

  // ── 3. Moves-per-day limit ──────────────────────────────────────────────────
  // Apply against the set of moves that passed the tx-limit check
  const dayCheck = checkMovesPerDay(allowedMoves.length, executedToday);
  checks.push(dayCheck);

  if (dayCheck.status === 'FAIL') {
    const available = Math.max(GUARDRAILS.MAX_MOVES_PER_DAY - executedToday, 0);
    // Trim allowedMoves to the budget; move the rest to blocked
    const overflow = allowedMoves.splice(available);
    for (const move of overflow) {
      blockedMoves.push({ move, reason: `Daily move budget exhausted (limit ${GUARDRAILS.MAX_MOVES_PER_DAY})` });
    }
  }

  const passed = checks.every((c) => c.status === 'PASS') && blockedMoves.length === 0;

  return { passed, checks, allowedMoves, blockedMoves };
}

/**
 * Check a live quote's slippage and return whether the move is safe to execute.
 * Call this just before broadcasting each transaction.
 */
export function validateQuote(
  quote: GetQuoteResponse,
  move: RebalancingMove,
): { safe: boolean; check: GuardrailCheck } {
  const slippageCheck = checkSlippage(quote);
  const txCheck = checkTxLimit(move);

  // Both must pass
  if (slippageCheck.status === 'FAIL') {
    return { safe: false, check: slippageCheck };
  }
  if (txCheck.status === 'FAIL') {
    return { safe: false, check: txCheck };
  }

  return { safe: true, check: slippageCheck };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Format a GuardrailReport as a compact human-readable string for logging. */
export function formatGuardrailReport(report: GuardrailReport): string {
  const lines: string[] = [
    `Guardrails: ${report.passed ? 'ALL PASS' : 'VIOLATIONS DETECTED'}`,
  ];

  for (const check of report.checks) {
    const icon = check.status === 'PASS' ? '✓' : '✗';
    lines.push(`  ${icon} [${check.rule}] ${check.message}`);
  }

  if (report.blockedMoves.length > 0) {
    lines.push(`\nBlocked ${report.blockedMoves.length} move(s):`);
    for (const { move, reason } of report.blockedMoves) {
      lines.push(
        `  ✗ $${move.amountUsd.toFixed(2)} ${move.fromChainName}→${move.toChainName}: ${reason}`,
      );
    }
  }

  if (report.allowedMoves.length > 0) {
    lines.push(`\nAllowed ${report.allowedMoves.length} move(s):`);
    for (const move of report.allowedMoves) {
      lines.push(
        `  ✓ $${move.amountUsd.toFixed(2)} ${move.fromChainName}→${move.toChainName}`,
      );
    }
  }

  return lines.join('\n');
}
