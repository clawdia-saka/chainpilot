/**
 * Sentinel — protocol health monitor
 *
 * Checks three anomaly signals per protocol/chain:
 *   1. TVL drop   — ERC4626 totalAssets() dropped ≥10% vs last check
 *   2. Depeg      — LI.FI quote for 1000 yieldToken → USDC yields < $980
 *   3. Paused     — vault contract's paused() returns true
 *
 * State between runs is persisted to STATE_FILE so TVL drop can be detected
 * across process restarts. Cancel flag file is checked during evacuate.
 *
 * Blue Team fix003 changes:
 *   - CRITICAL: totalSupply() replaced by convertToAssets(totalSupply()) as
 *     TVL fallback — raw supply is NOT a TVL proxy for rebase tokens (sUSDe).
 *   - HIGH: RpcTimeoutError distinguishes timeout from contract revert so
 *     timeouts are NOT silently treated as "no ERC4626 support".
 *   - HIGH: State stores { value, method } to detect cross-method comparisons
 *     that would produce phantom TVL changes; comparison is skipped on switch.
 *   - MEDIUM: withTimeout() helper clears the timer on resolution to prevent
 *     timer leaks in long-lived sentinel processes.
 */

import { ethers } from 'ethers';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { YIELD_PROTOCOLS, RPC_URLS, USDC_ADDRESSES, WALLET } from '../config.js';
import type { TargetChainId } from '../config.js';
import { lifi } from '../lifi/client.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const STATE_FILE = '/tmp/chainpilot-monitor-state.json';
// Random nonce prevents other processes from creating a cancel file without knowing it
const _cancelNonce = randomBytes(8).toString('hex');
export const CANCEL_FILE = `/tmp/chainpilot-cancel-evacuate-${_cancelNonce}`;

const TVL_DROP_THRESHOLD = 0.10; // 10% drop triggers alert
const DEPEG_THRESHOLD_USD = 980;  // <$980 out of $1000 in = >2% depeg
const RPC_TIMEOUT_MS = 15_000;

// ─── Timeout helper ───────────────────────────────────────────────────────────

/**
 * Named error class for RPC timeouts — allows callers to distinguish a
 * timeout (monitoring failure) from a contract revert (legitimate fallback).
 */
class RpcTimeoutError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'RpcTimeoutError';
  }
}

/**
 * Race `promise` against a timeout that rejects with `RpcTimeoutError`.
 * Clears the timeout timer on resolution to prevent timer leaks in
 * long-lived sentinel processes.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const race = Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timerId = setTimeout(
        () => reject(new RpcTimeoutError(`RPC timeout (${ms}ms): ${label}`)),
        ms,
      );
    }),
  ]);
  return race.finally(() => {
    if (timerId !== undefined) clearTimeout(timerId);
  });
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const ERC4626_ABI = [
  'function totalAssets() view returns (uint256)',
];

/**
 * ERC4626 convertToAssets + totalSupply — proper TVL for staking/rebase tokens.
 *
 * For tokens like Ethena sUSDe that may not implement totalAssets() directly:
 *   TVL ≈ convertToAssets(totalSupply())
 * This uses the contract's own exchange rate rather than treating raw supply
 * as USD value (which would be completely wrong for rebase tokens).
 */
const ERC4626_CONVERT_ABI = [
  'function totalSupply() view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
];

/**
 * DeFiLlama pool ID mapping for tokens where on-chain TVL reads are unavailable
 * (e.g. sUSDe on Base/Arb — pure ERC20 bridge, no ERC4626 functions).
 * Used as final fallback when both totalAssets() and convertToAssets() revert.
 */
const DEFILLAMA_POOL_IDS: Record<string, string> = {
  'ethena-1':     '66985a81-9c51-46ca-9977-42b4fe7bc6df',   // sUSDe Ethereum
  'ethena-8453':  '66985a81-9c51-46ca-9977-42b4fe7bc6df',   // sUSDe Base → use Eth pool (protocol-level TVL)
  'ethena-42161': '66985a81-9c51-46ca-9977-42b4fe7bc6df',   // sUSDe Arb  → use Eth pool
  'aave-1':       'aa70268e-4b52-42bf-a116-608b370f9501',   // Aave v3 USDC Eth
  'aave-8453':    '7e0661bf-8cf3-45e6-9424-31916d4c7b84',   // Aave v3 USDC Base
  'aave-42161':   'd9fa8e14-0447-4207-9ae8-7810199dfa1f',   // Aave v3 USDC Arb
};

const PAUSABLE_ABI = [
  'function paused() view returns (bool)',
];

// ─── DeFiLlama fallback ───────────────────────────────────────────────────────

/**
 * Fetch TVL from DeFiLlama pool API as final fallback when on-chain reads are
 * unavailable. Returns TVL in USD (raw number, not token-denominated).
 */
async function fetchTvlFromDeFiLlama(poolId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://yields.llama.fi/chart/${poolId}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const text = await res.text();
    const data = JSON.parse(text);
    const points = data?.data;
    if (!Array.isArray(points) || points.length === 0) return null;
    // Latest data point
    const latest = points[points.length - 1];
    return typeof latest.tvlUsd === 'number' ? latest.tvlUsd : null;
  } catch {
    return null;
  }
}

// ─── State persistence ────────────────────────────────────────────────────────

/** Which method was used to read the TVL for a given state key. */
type TvlMethod = 'totalAssets' | 'convertToAssets' | 'defillama';

interface MonitorStateEntry {
  value: number;
  method: TvlMethod;
}

interface MonitorState {
  [key: string]: MonitorStateEntry;
}

function loadState(): MonitorState {
  if (!existsSync(STATE_FILE)) return {};
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as Record<string, unknown>;
    const state: MonitorState = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'number') {
        // Migrate legacy format (plain number) — assume totalAssets method.
        // On next comparison the method is consistent so no false alert fires.
        state[k] = { value: v, method: 'totalAssets' };
      } else if (
        typeof v === 'object' &&
        v !== null &&
        typeof (v as Record<string, unknown>)['value'] === 'number'
      ) {
        state[k] = v as MonitorStateEntry;
      }
    }
    return state;
  } catch {
    return {};
  }
}

function saveState(state: MonitorState): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[monitor] Failed to save state:', err);
  }
}

// ─── Individual checks ────────────────────────────────────────────────────────

/**
 * Check if protocol TVL dropped ≥10% vs last recorded value.
 *
 * Measurement strategy (in order):
 *   1. ERC4626 totalAssets()              — standard, gives underlying asset TVL
 *   2. convertToAssets(totalSupply())     — correct TVL for staking/rebase tokens
 *      (e.g. sUSDe) whose contract reverts on totalAssets()
 *
 * Timeout (RpcTimeoutError) is treated as a monitoring FAILURE — never a signal
 * to silently switch methods, because an unresponsive RPC could mask a real event.
 *
 * Cross-method comparisons (method changed between runs) are skipped to avoid
 * phantom drops/increases from unit differences; state is updated but no alert fires.
 */
async function checkTvlDrop(
  protocol: string,
  chainId: TargetChainId,
  vaultAddress: string,
  state: MonitorState,
): Promise<string | null> {
  const stateKey = `${protocol}-${chainId}`;
  const provider = new ethers.JsonRpcProvider(RPC_URLS[chainId], chainId, { staticNetwork: true });
  const vault4626 = new ethers.Contract(vaultAddress, ERC4626_ABI, provider);
  const vaultConvert = new ethers.Contract(vaultAddress, ERC4626_CONVERT_ABI, provider);

  let currentAssets: bigint;
  let method: TvlMethod;

  try {
    // ── Attempt 1: ERC4626 totalAssets() ─────────────────────────────────────
    currentAssets = await withTimeout(
      (vault4626['totalAssets'] as () => Promise<bigint>)(),
      RPC_TIMEOUT_MS,
      `${protocol}@${chainId} totalAssets`,
    );
    method = 'totalAssets';
  } catch (err) {
    if (err instanceof RpcTimeoutError) {
      // Timeout = monitoring failure. Do NOT fall back — the fallback RPC would
      // also be unresponsive, and silently switching methods corrupts state.
      return `TVL check timed out for ${protocol}@${chainId}: RPC unresponsive (totalAssets)`;
    }

    // Contract revert → totalAssets() not implemented.
    // Use convertToAssets(totalSupply()) as the proper TVL proxy for rebase tokens.
    // Raw totalSupply() alone is NOT a TVL proxy: for rebase tokens the supply is
    // constant while the per-token value changes via yield accrual.
    console.log(
      `[monitor] ${protocol}@${chainId}: totalAssets() reverted — ` +
      `falling back to convertToAssets(totalSupply())`,
    );
    try {
      const supply = await withTimeout(
        (vaultConvert['totalSupply'] as () => Promise<bigint>)(),
        RPC_TIMEOUT_MS,
        `${protocol}@${chainId} totalSupply`,
      );
      currentAssets = await withTimeout(
        (vaultConvert['convertToAssets'] as (shares: bigint) => Promise<bigint>)(supply),
        RPC_TIMEOUT_MS,
        `${protocol}@${chainId} convertToAssets`,
      );
      method = 'convertToAssets';
    } catch (err2) {
      if (err2 instanceof RpcTimeoutError) {
        return `TVL check timed out for ${protocol}@${chainId}: RPC unresponsive (convertToAssets fallback)`;
      }
      // Neither on-chain method available (e.g. sUSDe on Base/Arb = pure ERC20 bridge).
      // Final fallback: DeFiLlama API for protocol-level TVL.
      console.log(
        `[monitor] ${protocol}@${chainId}: convertToAssets() also reverted — ` +
        `trying DeFiLlama API fallback`,
      );
      const poolId = DEFILLAMA_POOL_IDS[stateKey];
      if (poolId) {
        const llamaTvl = await fetchTvlFromDeFiLlama(poolId);
        if (llamaTvl !== null && llamaTvl > 0) {
          currentAssets = BigInt(Math.round(llamaTvl));
          method = 'defillama';
          console.log(
            `[monitor] ${protocol}@${chainId}: DeFiLlama TVL = $${llamaTvl.toLocaleString()} ` +
            `(protocol-level — ${protocol} has no per-chain vault on chain ${chainId})`,
          );
          // Fall through to comparison below
        } else {
          return `TVL check failed for ${protocol}@${chainId}: on-chain + DeFiLlama both unavailable`;
        }
      } else {
        return (
          `TVL check failed for ${protocol}@${chainId}: ` +
          `neither totalAssets() nor convertToAssets() available, no DeFiLlama pool configured`
        );
      }
    }
  }

  const currentNum = Number(currentAssets);
  const previous = state[stateKey];

  // ── Cross-method guard ────────────────────────────────────────────────────
  // If the measurement method changed between runs (e.g. RPC flap caused a switch),
  // the two values are not directly comparable (different units/scale). Skip the
  // comparison for this cycle and update state with the new baseline.
  if (previous !== undefined && previous.method !== method) {
    console.warn(
      `[monitor] TVL method changed for ${stateKey}: ${previous.method} → ${method}. ` +
      `Skipping drop comparison this cycle to avoid false alert from unit mismatch. ` +
      `New baseline: ${currentNum} (method: ${method})`,
    );
    state[stateKey] = { value: currentNum, method };
    return null;
  }

  // Save updated value with method tag
  state[stateKey] = { value: currentNum, method };

  if (previous !== undefined && previous.value > 0) {
    const dropPct = (previous.value - currentNum) / previous.value;
    if (dropPct >= TVL_DROP_THRESHOLD) {
      return (
        `TVL DROP: ${protocol}@chain${chainId} dropped ${(dropPct * 100).toFixed(1)}% ` +
        `(${previous.value} → ${currentNum}) [method: ${method}]`
      );
    }
  }

  return null;
}

/**
 * Check if the yield token is depegged vs USDC using a LI.FI quote.
 * Quotes 1000 units (in the token's own decimals) of yieldToken → USDC.
 * If output < $980 USDC, alert.
 */
async function checkDepeg(
  protocol: string,
  chainId: TargetChainId,
  yieldToken: string,
  decimals: number,
): Promise<string | null> {
  const usdcAddress = USDC_ADDRESSES[chainId];
  if (!usdcAddress) return null;

  // 1000 tokens in the correct decimal precision
  const quoteAmount = (1000n * 10n ** BigInt(decimals)).toString();

  try {
    const quote = await lifi.getQuote({
      fromChain: chainId,
      toChain: chainId,
      fromToken: yieldToken,
      toToken: usdcAddress,
      fromAmount: quoteAmount,
      fromAddress: WALLET.ADDRESS,
    });

    const toAmountRaw = (quote as unknown as { toAmount?: string }).toAmount;
    if (!toAmountRaw) return null;

    // USDC has 6 decimals
    const toAmountUsd = Number(toAmountRaw) / 1_000_000;
    if (toAmountUsd < DEPEG_THRESHOLD_USD) {
      return `DEPEG: ${protocol}@chain${chainId} quotes ${toAmountUsd.toFixed(2)} USDC for 1000 tokens (threshold ${DEPEG_THRESHOLD_USD})`;
    }
  } catch (err) {
    // H1 fix: API failure during depeg check is treated as UNHEALTHY.
    // Market stress = API failures = exactly when we need to be cautious.
    // A silent null here would blind the sentinel during the worst-case scenario.
    console.warn(`[monitor] Depeg quote failed for ${protocol}@${chainId}:`, err);
    return `DEPEG CHECK FAILED: ${protocol}@chain${chainId} — LI.FI quote error: ${String(err)}`;
  }

  return null;
}

/**
 * Check if the vault contract reports paused() = true.
 * If the contract doesn't implement paused(), we assume it's healthy.
 */
async function checkPaused(
  protocol: string,
  chainId: TargetChainId,
  vaultAddress: string,
): Promise<string | null> {
  const provider = new ethers.JsonRpcProvider(RPC_URLS[chainId], chainId, { staticNetwork: true });
  const vault = new ethers.Contract(vaultAddress, PAUSABLE_ABI, provider);

  try {
    const isPaused = await withTimeout(
      (vault['paused'] as () => Promise<boolean>)(),
      RPC_TIMEOUT_MS,
      `${protocol}@${chainId} paused`,
    );
    if (isPaused) {
      return `PAUSED: ${protocol}@chain${chainId} vault ${vaultAddress} is paused`;
    }
  } catch (err) {
    if (err instanceof RpcTimeoutError) {
      // Timeout on paused() is ambiguous — log but don't alert (conservative)
      console.warn(`[monitor] paused() timed out for ${protocol}@${chainId} — treating as healthy`);
    }
    // Contract revert: likely doesn't implement paused() — treat as healthy
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface HealthResult {
  healthy: boolean;
  alerts: string[];
}

// Serialise concurrent checkProtocolHealth calls to prevent state file races.
// Each call is chained after the previous one — no parallel state load/save.
let _pendingCheck: Promise<unknown> = Promise.resolve();

/**
 * Run all anomaly checks for a protocol on a chain.
 * Returns { healthy, alerts } — healthy = true when alerts is empty.
 *
 * Calls are serialised via a module-level promise chain to prevent
 * race conditions when multiple protocols are checked concurrently.
 */
export function checkProtocolHealth(
  protocol: string,
  chainId: TargetChainId,
): Promise<HealthResult> {
  const result = _pendingCheck.then(
    () => _doCheck(protocol, chainId),
    () => _doCheck(protocol, chainId), // run even if previous call errored
  );
  _pendingCheck = result.catch(() => {}); // don't block the queue on errors
  return result;
}

async function _doCheck(
  protocol: string,
  chainId: TargetChainId,
): Promise<HealthResult> {
  const config = YIELD_PROTOCOLS[protocol]?.[chainId];
  if (!config) {
    return {
      healthy: false,
      alerts: [`No config for ${protocol}@chain${chainId}`],
    };
  }

  // Use receiptToken for depeg check (the token we hold, e.g. syrupUSDC for Maple)
  const yieldToken = config.receiptToken ?? config.depositToken;

  const state = loadState();

  const [tvlAlert, depegAlert, pausedAlert] = await Promise.all([
    checkTvlDrop(protocol, chainId, config.vaultAddress, state),
    checkDepeg(protocol, chainId, yieldToken, config.decimals),
    checkPaused(protocol, chainId, config.vaultAddress),
  ]);

  saveState(state);

  const alerts = [tvlAlert, depegAlert, pausedAlert].filter((a): a is string => a !== null);

  return {
    healthy: alerts.length === 0,
    alerts,
  };
}
