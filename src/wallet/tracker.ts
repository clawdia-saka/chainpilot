/**
 * Transaction tracker
 *
 * Polls the LI.FI /status endpoint until a cross-chain transfer reaches a
 * terminal state (DONE | FAILED) or the maximum wait time is exceeded.
 *
 * Polling strategy:
 *   - Fixed interval: 10 s (cross-chain bridges typically settle in 1–5 min)
 *   - Hard timeout:   20 min — returns timedOut=true if exceeded
 *   - Errors during polling are logged but do not abort the loop
 *
 * Blue Team fix003 changes:
 *   - CRITICAL: mayanBalanceFallback validates delta ≥ expectedAmount × 98.5%
 *     to reject false-positive DONE from unrelated deposits (TOCTOU fix).
 *   - HIGH: mayanFallbackTriggered is only set AFTER initial balance read
 *     succeeds — RPC failure on the first read no longer permanently disables
 *     the fallback.
 *   - HIGH: Synthetic DONE status includes address + timestamp in receiving;
 *     notes why destination txHash is unavailable (Mayan/Solana route).
 *   - HIGH: extractLifiErrorCode() probes multiple error shapes (flat, Axios,
 *     wrapped Error, ethers) and logs the full error when code is not found.
 */

import { ethers } from 'ethers';
import { lifi } from '../lifi/client.js';
import { RPC_URLS } from '../config.js';
import type { TargetChainId } from '../config.js';
import type { GetStatusResponse, TxStatus } from '../lifi/types.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;       // 10 seconds between polls
const MAX_WAIT_MS      = 20 * 60_000;  // 20 minute hard ceiling
/** LI.FI error code returned when the tx routes through Solana (e.g. Mayan) */
const LIFI_CODE_NOT_EVM = 1011;
/** How long to wait before checking destination balance after a 1011 error */
const MAYAN_FALLBACK_WAIT_MS = 60_000;
/**
 * Minimum fraction of expectedAmount that must arrive to treat a balance
 * increase as the bridged funds (allows for protocol fees up to ~1.5%).
 */
const MAYAN_AMOUNT_TOLERANCE = 985n; // numerator; denominator = 1000 → 98.5%

const TERMINAL: ReadonlySet<TxStatus> = new Set<TxStatus>(['DONE', 'FAILED']);

const ERC20_BALANCE_ABI = ['function balanceOf(address) view returns (uint256)'];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrackResult {
  /** The monitored transaction hash */
  txHash: string;
  /** Last status response received */
  finalStatus: GetStatusResponse;
  /** Wall-clock time elapsed from start to terminal/timeout (ms) */
  elapsedMs: number;
  /** true when MAX_WAIT_MS was reached before a terminal status */
  timedOut: boolean;
}

/** Discriminated return type from mayanBalanceFallback */
type MayanFallbackResult =
  | { outcome: 'done'; status: GetStatusResponse }
  | { outcome: 'no_increase' }
  | { outcome: 'rpc_failure' };

// ─── Error code extraction ────────────────────────────────────────────────────

/**
 * Probe several known LI.FI SDK error shapes for a numeric error code.
 *
 * The SDK has shipped with at least two different error shapes across versions:
 *   - Flat:      err.code
 *   - Axios-ish: err.response.data.code
 *   - Wrapped:   err.cause.code
 *   - ethers:    err.data.code
 *
 * Returns undefined (and logs the full error) when no code is found so that
 * callers can diagnose SDK shape changes rather than silently missing the 1011.
 */
function extractLifiErrorCode(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;

  const e = err as Record<string, unknown>;

  // Flat shape (most common; what the current SDK re-throws)
  if (typeof e['code'] === 'number') return e['code'] as number;

  // Axios-style: err.response.data.code
  if (typeof e['response'] === 'object' && e['response'] !== null) {
    const data = (e['response'] as Record<string, unknown>)['data'];
    if (typeof data === 'object' && data !== null) {
      const code = (data as Record<string, unknown>)['code'];
      if (typeof code === 'number') return code;
    }
  }

  // Wrapped Error: err.cause.code
  if (typeof e['cause'] === 'object' && e['cause'] !== null) {
    const cause = e['cause'] as Record<string, unknown>;
    if (typeof cause['code'] === 'number') return cause['code'] as number;
  }

  // ethers-style: err.data.code
  if (typeof e['data'] === 'object' && e['data'] !== null) {
    const data = e['data'] as Record<string, unknown>;
    if (typeof data['code'] === 'number') return data['code'] as number;
  }

  // No recognisable code found — log full error to surface SDK shape changes
  console.warn(
    '[tracker] extractLifiErrorCode: no numeric .code found in error. ' +
    'Full error object (may indicate SDK version change):',
    JSON.stringify(err, Object.getOwnPropertyNames(err)),
  );
  return undefined;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Poll LI.FI transfer status until terminal state or timeout.
 *
 * @param txHash            Source-chain transaction hash
 * @param bridge            Bridge tool name (optional, speeds up status lookup)
 * @param fromChain         Source chain ID
 * @param toChain           Destination chain ID
 * @param toToken           Destination token address (used for Mayan/1011 fallback)
 * @param toAddress         Recipient address (used for Mayan/1011 fallback)
 * @param expectedToAmount  Expected destination amount in token units (wei string).
 *                          Used to validate Mayan balance-delta against the actual
 *                          bridged amount, preventing false-DONE from unrelated deposits.
 *                          Strongly recommended whenever Mayan routing is possible.
 */
export async function trackTransaction(
  txHash: string,
  bridge?: string,
  fromChain?: number,
  toChain?: number,
  toToken?: string,
  toAddress?: string,
  expectedToAmount?: string,
): Promise<TrackResult> {
  const start = Date.now();

  // Sentinel "pending" status for timeout fallback
  const pendingFallback: GetStatusResponse = {
    status: 'PENDING',
    sending: {},
    receiving: {},
  };

  let lastStatus: GetStatusResponse = pendingFallback;
  let mayanFallbackTriggered = false;

  console.log(
    `[tracker] Watching tx ${txHash}` +
    (bridge ? ` via ${bridge}` : '') +
    (fromChain && toChain ? ` (${fromChain} → ${toChain})` : ''),
  );

  while (true) {
    const elapsed = Date.now() - start;

    if (elapsed > MAX_WAIT_MS) {
      console.warn(
        `[tracker] Timeout after ${Math.round(elapsed / 1000)}s — tx ${txHash} still ${lastStatus.status}`,
      );
      return { txHash, finalStatus: lastStatus, elapsedMs: elapsed, timedOut: true };
    }

    try {
      const status = await lifi.getStatus({ txHash, bridge, fromChain, toChain });
      lastStatus = status;

      console.log(
        `[tracker] ${txHash} — ${status.status}` +
        (status.subStatus ? ` (${status.subStatus})` : '') +
        ` [${Math.round(elapsed / 1000)}s]`,
      );

      if (TERMINAL.has(status.status)) {
        return { txHash, finalStatus: status, elapsedMs: Date.now() - start, timedOut: false };
      }
    } catch (err) {
      const errCode = extractLifiErrorCode(err);

      if (errCode === LIFI_CODE_NOT_EVM && !mayanFallbackTriggered) {
        console.warn(
          `[tracker] LI.FI returned 1011 (Not an EVM Transaction) for ${txHash} — ` +
          `Mayan/Solana route detected. Falling back to destination balance polling.`,
        );

        if (toChain && toToken && toAddress) {
          if (!expectedToAmount) {
            console.warn(
              '[tracker] expectedToAmount not provided — amount threshold validation disabled. ' +
              'Any balance increase on toAddress will be treated as the bridged funds. ' +
              'Pass expectedToAmount to prevent false-DONE from concurrent deposits.',
            );
          }

          const fallback = await mayanBalanceFallback(
            toChain, toToken, toAddress, txHash, expectedToAmount,
          );

          if (fallback.outcome === 'rpc_failure') {
            // RPC could not read initial balance — do NOT mark fallback as triggered.
            // The next 1011 error will retry the fallback with a fresh balance read.
            console.warn(
              '[tracker] Mayan fallback aborted due to RPC failure — ' +
              'will retry on next 1011 error.',
            );
          } else {
            // Mark as triggered only when the observation window was actually executed
            // (initial balance read succeeded). Prevents infinite retries after
            // the 60s window has been consumed.
            mayanFallbackTriggered = true;

            if (fallback.outcome === 'done') {
              return {
                txHash,
                finalStatus: fallback.status,
                elapsedMs: Date.now() - start,
                timedOut: false,
              };
            }
            // outcome === 'no_increase': balance did not rise — continue polling loop
          }
        } else {
          // Missing destination params — mark triggered to avoid repeat log spam
          mayanFallbackTriggered = true;
          console.warn(
            `[tracker] Cannot do balance fallback: toChain/toToken/toAddress not provided. ` +
            `Will continue polling (tx will likely time out).`,
          );
        }
      } else if (errCode !== LIFI_CODE_NOT_EVM) {
        // Network hiccups are expected during long bridge waits — keep polling
        console.warn(`[tracker] Poll error for ${txHash}:`, err);
      }
      // If errCode === 1011 and mayanFallbackTriggered, just keep polling silently
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Fallback for Mayan (Solana-routed) bridges that LI.FI cannot track via /status.
 *
 * Reads the recipient's initial destination token balance, waits
 * MAYAN_FALLBACK_WAIT_MS, then checks if the balance increased by at least
 * expectedAmount × 98.5% (to account for fees while rejecting dust deposits
 * and concurrent unrelated transfers that would otherwise cause a false DONE).
 *
 * Returns:
 *   { outcome: 'done', status }   — balance increased by expected amount ✓
 *   { outcome: 'no_increase' }    — balance unchanged or increase < threshold
 *   { outcome: 'rpc_failure' }    — could not read initial balance (caller must NOT
 *                                   set mayanFallbackTriggered so it can be retried)
 */
async function mayanBalanceFallback(
  toChain: number,
  toToken: string,
  toAddress: string,
  txHash: string,
  expectedAmount?: string,
): Promise<MayanFallbackResult> {
  const rpcUrl = RPC_URLS[toChain as TargetChainId];
  if (!rpcUrl) {
    console.warn(`[tracker] No RPC URL for chain ${toChain} — cannot do Mayan balance fallback`);
    return { outcome: 'rpc_failure' };
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl, toChain, { staticNetwork: true });
  const token = new ethers.Contract(toToken, ERC20_BALANCE_ABI, provider);

  // ── Read initial balance ───────────────────────────────────────────────────
  // If this fails, return rpc_failure so the caller does NOT mark the fallback
  // as triggered. The next 1011 error will retry with a fresh read attempt.
  let initialBalance: bigint;
  try {
    initialBalance = await (token['balanceOf'] as (addr: string) => Promise<bigint>)(toAddress);
  } catch (err) {
    console.warn(`[tracker] Could not read initial balance for Mayan fallback:`, err);
    return { outcome: 'rpc_failure' };
  }

  console.log(
    `[tracker] Mayan fallback: initial balance on chain ${toChain} = ${initialBalance}. ` +
    `Waiting ${MAYAN_FALLBACK_WAIT_MS / 1000}s…`,
  );
  await sleep(MAYAN_FALLBACK_WAIT_MS);

  // ── Read final balance ────────────────────────────────────────────────────
  let newBalance: bigint;
  try {
    newBalance = await (token['balanceOf'] as (addr: string) => Promise<bigint>)(toAddress);
  } catch (err) {
    console.warn(`[tracker] Could not read final balance for Mayan fallback:`, err);
    // Treat as no_increase (not rpc_failure) — the window was consumed.
    return { outcome: 'no_increase' };
  }

  if (newBalance <= initialBalance) {
    console.warn(
      `[tracker] Mayan fallback: balance did NOT increase after ${MAYAN_FALLBACK_WAIT_MS / 1000}s ` +
      `(${initialBalance} → ${newBalance}). Will continue polling.`,
    );
    return { outcome: 'no_increase' };
  }

  const delta = newBalance - initialBalance;

  // ── Amount threshold validation (TOCTOU guard) ────────────────────────────
  // Require delta ≥ expectedAmount × 98.5% to reject false-DONE from:
  //   - Concurrent bridge completions
  //   - External deposits / airdrops arriving during the 60s window
  //   - Adversarial dust sends designed to trigger early DONE
  if (expectedAmount) {
    const expected = BigInt(expectedAmount);
    const minRequired = expected * MAYAN_AMOUNT_TOLERANCE / 1000n;
    if (delta < minRequired) {
      console.warn(
        `[tracker] Mayan fallback: balance increased by ${delta} but expected ≥ ${minRequired} ` +
        `(${expected} × ${Number(MAYAN_AMOUNT_TOLERANCE) / 10}%). ` +
        `Likely an unrelated deposit — rejecting to avoid false DONE.`,
      );
      return { outcome: 'no_increase' };
    }
  }

  const received = delta.toString();
  console.log(
    `[tracker] Mayan fallback DONE: ${txHash} — balance increased by ${received} on chain ${toChain}`,
  );

  // Synthetic DONE status — fills all available audit fields.
  // NOTE: receiving.txHash is structurally unavailable: Mayan routes through
  // Solana and LI.FI cannot return a destination EVM txHash for this path.
  // The subStatus 'MAYAN_BALANCE_CONFIRMED' indicates balance-based verification.
  return {
    outcome: 'done',
    status: {
      status: 'DONE',
      sending: { txHash },
      receiving: {
        amount: received,
        chainId: toChain,
        address: toAddress,
        // txHash intentionally absent — Mayan/Solana route; no EVM dest tx to record
        timestamp: Math.floor(Date.now() / 1000),
      },
      subStatus: 'MAYAN_BALANCE_CONFIRMED',
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
