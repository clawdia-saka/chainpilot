/**
 * ChainPilot — main orchestrator
 *
 * Runs one full allocation cycle:
 *   1. Intel   — fetch TVL/DEX signals + LI.FI bridge data
 *   2. Decision — compute a risk-adjusted rebalancing plan
 *   3. Execute  — quote → sign → broadcast → track each move
 *   4. Report   — send Telegram summary via openclaw
 *
 * Entry point: `tsx src/index.ts`  or  `node dist/index.js`
 */

import { generateSignalReport }  from './intel/signal.js';
import { computeAllocation }     from './main/allocator.js';
import { fetchAllUsdcBalances, signAndBroadcast } from './wallet/signer.js';
import { trackTransaction }      from './wallet/tracker.js';
import { lifi }                  from './lifi/client.js';
import {
  TARGET_CHAINS,
  USDC_ADDRESSES,
  WALLET,
  GUARDRAILS,
} from './config.js';
import type { TargetChainId } from './config.js';
import { getBestYieldToken } from './intel/yield.js';
import type { YieldEntry } from './intel/yield.js';
import { checkProtocolHealth } from './sentinel/monitor.js';
import type { Portfolio, RebalancingMove } from './main/allocator.js';
import { validatePlan, validateQuote, formatGuardrailReport } from './main/guardrails.js';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ─── Notification ─────────────────────────────────────────────────────────────

/**
 * Send a Telegram message via openclaw.
 * Failures are silently logged — notification errors must not abort the cycle.
 */
async function notify(text: string): Promise<void> {
  try {
    await execFileAsync('openclaw', [
      'message', 'send',
      '--channel', 'telegram',
      '--target',  '477144117',
      '--message', text,
    ]);
    console.log('[notify] Telegram ✓');
  } catch (err) {
    console.warn('[notify] Failed to send Telegram notification:', err);
  }
}

// ─── Portfolio fetch ──────────────────────────────────────────────────────────

async function fetchPortfolio(): Promise<Portfolio> {
  const raw = await fetchAllUsdcBalances();
  // Cast to Portfolio (Partial<Record<TargetChainId, number>>)
  const portfolio: Portfolio = {};
  const targetIds = Object.values(TARGET_CHAINS) as TargetChainId[];
  for (const id of targetIds) {
    const bal = raw[id];
    if (bal !== undefined) portfolio[id] = bal;
  }
  return portfolio;
}

// ─── Yield token selection ────────────────────────────────────────────────────

/**
 * Pick the highest-APY deposit token from healthy protocols on a chain.
 * Falls back to getBestYieldToken (config-only) if no healthy option found.
 */
async function selectYieldToken(
  chainId: TargetChainId,
  yieldOptions: YieldEntry[],
): Promise<string> {
  // Filter options to this chain, already sorted by APY descending
  const chainOptions = yieldOptions.filter((e) => e.chainId === chainId);

  for (const option of chainOptions) {
    try {
      const health = await checkProtocolHealth(option.protocol, chainId);
      if (health.healthy) {
        console.log(
          `[yield] Selected ${option.protocol} on chain ${chainId} ` +
          `(APY ${option.apy.toFixed(2)}%)`,
        );
        return option.depositToken;
      }
      console.warn(
        `[yield] ${option.protocol}@${chainId} unhealthy:`,
        health.alerts.join('; '),
      );
    } catch (err) {
      console.warn(`[yield] Health check failed for ${option.protocol}@${chainId}:`, err);
    }
  }

  // Fallback: use config-based best token without health check
  const fallback = getBestYieldToken(chainId);
  console.warn(`[yield] No healthy protocol found for chain ${chainId}, using fallback ${fallback.protocol}`);
  return fallback.address;
}

// ─── Move execution ───────────────────────────────────────────────────────────

interface MoveResult {
  move:          RebalancingMove;
  success:       boolean;
  txHash?:       string;
  error?:        string;
  statusLabel?:  string;
}

async function executeMove(
  move: RebalancingMove,
  yieldOptions: YieldEntry[] = [],
): Promise<MoveResult> {
  // USDC has 6 decimals; amountUsd is treated as face-value USD ≈ USDC
  const amountUnits = Math.round(move.amountUsd * 1_000_000).toString();

  console.log(
    `[exec] ${move.fromChainName} → ${move.toChainName}` +
    `  $${move.amountUsd.toFixed(2)} USDC`,
  );

  // ── Yield token selection ────────────────────────────────────────────────────
  // Destination: pick best healthy yield protocol deposit token
  const toToken = await selectYieldToken(move.toChainId, yieldOptions);
  // Source: use current yield token (if we're rebalancing out of a yield position)
  const fromToken = USDC_ADDRESSES[move.fromChainId];

  // ── 1. Get quote ────────────────────────────────────────────────────────────
  let quote: Awaited<ReturnType<typeof lifi.getQuote>>;
  try {
    quote = await lifi.getQuote({
      fromChain:   move.fromChainId,
      toChain:     move.toChainId,
      fromToken:   fromToken,
      toToken:     toToken,
      fromAmount:  amountUnits,
      fromAddress: WALLET.ADDRESS,
      slippage:    GUARDRAILS.MAX_SLIPPAGE,
      order:       GUARDRAILS.ROUTE_ORDER,
    });
  } catch (err) {
    const error = `Quote failed: ${String(err)}`;
    console.error(`[exec] ${error}`);
    return { move, success: false, error };
  }

  // ── 1b. Guardrail: validate quote (slippage + tx size) ─────────────────────
  const { safe, check } = validateQuote(quote, move);
  if (!safe) {
    const error = `Guardrail blocked: [${check.rule}] ${check.message}`;
    console.error(`[exec] ${error}`);
    return { move, success: false, error };
  }
  console.log(`[exec] Guardrail OK: ${check.message}`);

  // ── 2. Sign + broadcast ─────────────────────────────────────────────────────
  let txHash: string;
  try {
    // Attach approval info from quote for ERC20 approve step
    const txReq = {
      ...quote.transactionRequest,
      approvalAddress: (quote as any).estimate?.approvalAddress,
      fromToken: (quote as any).action?.fromToken?.address,
      fromAmount: (quote as any).action?.fromAmount,
    };
    const broadcast = await signAndBroadcast(txReq);
    txHash = broadcast.txHash;
  } catch (err) {
    const error = `Broadcast failed: ${String(err)}`;
    console.error(`[exec] ${error}`);
    return { move, success: false, error };
  }

  await notify(
    `🚀 ChainPilot move started\n` +
    `${move.fromChainName} → ${move.toChainName}\n` +
    `Amount: $${move.amountUsd.toFixed(2)} USDC\n` +
    `Bridge: ${quote.tool}\n` +
    `Tx: ${txHash}`,
  );

  // ── 3. Track ────────────────────────────────────────────────────────────────
  const track = await trackTransaction(
    txHash,
    quote.tool,
    move.fromChainId,
    move.toChainId,
  );

  const finalStatus = track.finalStatus.status;
  const elapsed     = Math.round(track.elapsedMs / 1000);
  const statusLabel = track.timedOut
    ? `timed out after ${Math.round(track.elapsedMs / 60_000)}m`
    : `${finalStatus} in ${elapsed}s`;

  const icon = finalStatus === 'DONE' ? '✅' : '❌';
  await notify(
    `${icon} ChainPilot move ${finalStatus}\n` +
    `${move.fromChainName} → ${move.toChainName}\n` +
    `$${move.amountUsd.toFixed(2)} USDC — ${statusLabel}\n` +
    `Tx: ${txHash}`,
  );

  return {
    move,
    success: finalStatus === 'DONE',
    txHash,
    statusLabel,
  };
}

// ─── Main cycle ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const runAt = new Date().toISOString();
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`ChainPilot cycle  ${runAt}`);
  console.log(`${'═'.repeat(55)}\n`);

  await notify(`🤖 ChainPilot cycle starting\n${runAt}`);

  // ── Phase 1: Intel ──────────────────────────────────────────────────────────
  console.log('[1/4] Collecting intel...');
  const [signalReport, portfolio] = await Promise.all([
    generateSignalReport(),
    fetchPortfolio(),
  ]);

  const totalUsd = Object.values(portfolio).reduce((s, v) => s + (v ?? 0), 0);
  console.log(
    `[1/4] Signal complete — top chain: ${signalReport.chains[0]?.chainName}, ` +
    `quality: ${signalReport.dataQualityOk}`,
  );
  console.log(`[1/4] Portfolio total: $${totalUsd.toFixed(2)} USDC`);

  // ── Phase 2: Decision ───────────────────────────────────────────────────────
  console.log('[2/4] Computing allocation plan...');
  const plan = computeAllocation([signalReport], portfolio);
  console.log(`[2/4] ${plan.summary}`);

  // Guard: bad data quality
  if (!plan.dataQualityOk) {
    const msg =
      `⚠️ ChainPilot: data quality check failed — skipping execution.\n` +
      plan.summary;
    console.warn('[2/4] ' + msg);
    await notify(msg);
    return;
  }

  // Guard: nothing to do
  if (plan.moves.length === 0) {
    const msg = `ℹ️ ChainPilot: no moves needed.\n${plan.summary}`;
    console.log('[2/4] ' + msg);
    await notify(msg);
    return;
  }

  // ── Phase 3: Execute ────────────────────────────────────────────────────────
  // H3 fix: Run guardrail validation before executing ANY moves.
  const guardrailReport = validatePlan(plan);
  console.log('[3/4] ' + formatGuardrailReport(guardrailReport));

  if (guardrailReport.blockedMoves.length > 0) {
    const blockedSummary = guardrailReport.blockedMoves
      .map((b) => `  ✗ $${b.move.amountUsd.toFixed(2)} ${b.move.fromChainName}→${b.move.toChainName}: ${b.reason}`)
      .join('\n');
    await notify(`⚠️ ChainPilot: ${guardrailReport.blockedMoves.length} move(s) blocked by guardrails:\n${blockedSummary}`);
  }

  if (guardrailReport.allowedMoves.length === 0) {
    const msg = `⚠️ ChainPilot: all moves blocked by guardrails — skipping execution.\n${plan.summary}`;
    console.warn('[3/4] ' + msg);
    await notify(msg);
    return;
  }

  console.log(`[3/4] Executing ${guardrailReport.allowedMoves.length} allowed move(s)...`);
  const results: MoveResult[] = [];
  const yieldOptions = signalReport.yieldOptions ?? [];

  for (const move of guardrailReport.allowedMoves) {
    if (results.length >= GUARDRAILS.MAX_MOVES_PER_DAY) {
      console.warn('[3/4] MAX_MOVES_PER_DAY reached — stopping early.');
      break;
    }

    const result = await executeMove(move, yieldOptions);
    results.push(result);

    // One retry allowed per GUARDRAILS.MAX_RETRIES
    if (!result.success && GUARDRAILS.MAX_RETRIES >= 1 && !result.txHash) {
      console.log(`[3/4] Retrying failed move once...`);
      const retry = await executeMove(move, yieldOptions);
      results[results.length - 1] = retry;
    }
  }

  // ── Phase 4: Report ─────────────────────────────────────────────────────────
  console.log('[4/4] Sending summary report...');

  const succeeded = results.filter((r) => r.success).length;
  const failed    = results.filter((r) => !r.success).length;

  const moveLines = results
    .map((r) =>
      `${r.success ? '✅' : '❌'} $${r.move.amountUsd.toFixed(2)} ` +
      `${r.move.fromChainName}→${r.move.toChainName}` +
      (r.statusLabel ? ` (${r.statusLabel})` : r.error ? ` (${r.error})` : ''),
    )
    .join('\n');

  const report =
    `📊 ChainPilot cycle complete\n` +
    `${succeeded} succeeded, ${failed} failed\n` +
    `Portfolio: $${plan.totalPortfolioUsd.toFixed(2)} USDC\n` +
    (moveLines ? moveLines + '\n' : '') +
    plan.summary;

  console.log('\n' + report.replace(/\n/g, '\n  '));
  await notify(report);

  console.log(`\n[done] Cycle finished at ${new Date().toISOString()}`);
}

// ─── Entry ────────────────────────────────────────────────────────────────────

main().catch((err: unknown) => {
  console.error('[fatal]', err);
  process.exit(1);
});
