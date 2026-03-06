/**
 * Yield intel module
 * Fetches APY data from Ethena (sUSDe staking) and Aave v3 (USDC supply rate).
 * Returns per-chain ranked yield options.
 *
 * Priority: Ethena sUSDe > Aave v3 USDC (fallback).
 * Aave data is read on-chain via ethers.js using public RPC endpoints.
 *
 * NOTE: Maple (syrupUSDC) was removed — broken APY math + broken ERC4626 convertToAssets
 * on non-Ethereum chains. See Red Team report C1/C2 for background.
 */

import { ethers } from 'ethers';
import { TARGET_CHAINS, YIELD_TOKENS, YIELD_PROTOCOLS, USDC_ADDRESSES, RPC_URLS } from '../config.js';
import type { TargetChainId } from '../config.js';

// ─── Sky sUSDS APY (via DeFiLlama) ──────────────────────────────────────────

const SKY_DEFILLAMA_POOL = 'd8c4eff5-c8a9-46fc-a888-057c4c668e72';

/** Maximum plausible APY for Sky sUSDS (sanity cap). */
const SKY_MAX_APY = 20;

/**
 * Fetch current Sky sUSDS APY from DeFiLlama yields API.
 * Returns APY in percent (e.g., 4.0 for 4.0%).
 * Falls back to on-chain SSR rate calculation if DeFiLlama fails.
 */
async function fetchSkyApy(): Promise<number> {
  const res = await fetch(
    `https://yields.llama.fi/chart/${SKY_DEFILLAMA_POOL}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`DeFiLlama Sky pool responded ${res.status}`);
  const data = (await res.json()) as { status: string; data: Array<{ apy: number }> };
  if (data.status !== 'success' || !data.data?.length) {
    throw new Error('DeFiLlama Sky: no data points');
  }
  // Latest data point
  const latest = data.data[data.data.length - 1]!;
  const raw = latest.apy;
  if (typeof raw !== 'number' || !isFinite(raw) || raw < 0) {
    throw new Error(`Sky: APY ${raw} is invalid`);
  }
  return Math.min(raw, SKY_MAX_APY);
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ChainYieldData {
  chainId: TargetChainId;
  /** Best yield protocol for this chain */
  protocol: 'sky' | 'ethena' | 'aave';
  /** APY in percent (e.g., 5.2 = 5.2%) */
  apy: number;
  /** Deposit/receipt token address (sUSDS, sUSDe, or aUSDC) */
  tokenAddress: string;
}

// ─── Ethena sUSDe APY ─────────────────────────────────────────────────────────

const ETHENA_YIELD_URL = 'https://ethena.fi/api/yields/protocol-and-staking-yield';

/** Maximum plausible APY for Ethena sUSDe staking (sanity cap). */
const ETHENA_MAX_APY = 50;

interface EthenaYieldResponse {
  stakingYield?: { value?: number };
  [key: string]: unknown;
}

/**
 * Fetch current sUSDe APY from Ethena's public yield API.
 * Returns APY in percent (e.g., 5.2 for 5.2%).
 * The API already returns percent values (e.g., 3.6 = 3.6%).
 * Capped at ETHENA_MAX_APY to reject corrupted/manipulated API responses.
 */
async function fetchEthenaApy(): Promise<number> {
  const res = await fetch(ETHENA_YIELD_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Ethena API responded ${res.status}`);
  const data = (await res.json()) as EthenaYieldResponse;
  const raw = data?.stakingYield?.value;
  if (typeof raw !== 'number' || !isFinite(raw)) {
    throw new Error('Ethena: stakingYield.value missing or non-numeric');
  }
  if (raw < 0) {
    throw new Error(`Ethena: APY ${raw}% is negative — rejecting anomalous value`);
  }
  // Cap at ETHENA_MAX_APY to protect against API manipulation / data corruption
  return Math.min(raw, ETHENA_MAX_APY);
}

// ─── Aave v3 USDC supply APY ──────────────────────────────────────────────────

/**
 * Minimal ABI for Aave v3 Pool.getReserveData.
 * We only extract currentLiquidityRate (ray = 1e27 precision).
 */
const AAVE_POOL_ABI = [
  'function getReserveData(address asset) view returns (' +
    'tuple(' +
    'tuple(uint256 data) configuration,' +
    'uint128 liquidityIndex,' +
    'uint128 currentLiquidityRate,' +
    'uint128 variableBorrowIndex,' +
    'uint128 currentVariableBorrowRate,' +
    'uint128 currentStableBorrowRate,' +
    'uint40 lastUpdateTimestamp,' +
    'uint16 id,' +
    'address aTokenAddress,' +
    'address stableDebtTokenAddress,' +
    'address variableDebtTokenAddress,' +
    'address interestRateStrategyAddress,' +
    'uint128 accruedToTreasury,' +
    'uint128 unbacked,' +
    'uint128 isolationModeTotalDebt' +
    ')' +
    ')',
];

/**
 * Compute compounded APY from Aave's ray-precision liquidity rate.
 * Formula from Aave docs:
 *   rate = currentLiquidityRate / 1e27
 *   apy  = ((1 + rate / (365 * 86400)) ^ (365 * 86400) − 1) × 100
 */
function rayToApy(liquidityRate: bigint): number {
  const RAY = 1e27;
  const rate = Number(liquidityRate) / RAY;
  // Use ln approximation for large exponents: (1 + x/n)^n ≈ e^x for large n
  const apy = (Math.exp(rate) - 1) * 100;
  return apy;
}

/**
 * Fetch Aave v3 USDC supply APY for a given chain.
 * Reads currentLiquidityRate on-chain via public RPC.
 */
async function fetchAaveApy(chainId: TargetChainId): Promise<number> {
  const config = YIELD_TOKENS[chainId];
  if (!config.aave) throw new Error(`No Aave config for chain ${chainId}`);

  const provider = new ethers.JsonRpcProvider(RPC_URLS[chainId], chainId, { staticNetwork: true });
  const pool = new ethers.Contract(config.aave.poolAddress, AAVE_POOL_ABI, provider);
  const usdcAddress = USDC_ADDRESSES[chainId];

  const call = (pool['getReserveData'] as (asset: string) => Promise<{
    currentLiquidityRate: bigint;
  }>)(usdcAddress);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Aave RPC timeout chain ${chainId}`)), 15_000),
  );
  const reserveData = await Promise.race([call, timeout]);

  return rayToApy(reserveData.currentLiquidityRate);
}

// ─── Per-chain best yield ──────────────────────────────────────────────────────

/**
 * Determine the best yield option for a single chain.
 * Tries Ethena first (global APY; falls back to Aave on-chain data).
 * If both fail, returns a 0% APY Aave entry.
 */
async function fetchChainYield(
  chainId: TargetChainId,
  ethenaApyResult: PromiseSettledResult<number>,
  skyApyResult: PromiseSettledResult<number>,
): Promise<ChainYieldData> {
  const tokens = YIELD_TOKENS[chainId];

  // Collect candidates and pick highest APY
  const candidates: Array<{ protocol: 'sky' | 'ethena' | 'aave'; apy: number; tokenAddress: string }> = [];

  // ── Sky sUSDS (if available on this chain) ─────────────────────────────────
  if (tokens.sky && skyApyResult.status === 'fulfilled') {
    candidates.push({
      protocol: 'sky',
      apy: skyApyResult.value,
      tokenAddress: tokens.sky.sUSDS,
    });
  }

  // ── Ethena sUSDe (if available on this chain) ──────────────────────────────
  if (tokens.ethena && ethenaApyResult.status === 'fulfilled') {
    candidates.push({
      protocol: 'ethena',
      apy: ethenaApyResult.value,
      tokenAddress: tokens.ethena.sUSDe,
    });
  }

  // Return best candidate so far if we have any
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.apy - a.apy);
    const best = candidates[0]!;
    return { chainId, ...best };
  }

  // ── Try Aave on-chain ──────────────────────────────────────────────────────
  if (tokens.aave) {
    try {
      const apy = await fetchAaveApy(chainId);
      return {
        chainId,
        protocol: 'aave',
        apy,
        tokenAddress: tokens.aave.aUSDC,
      };
    } catch (err) {
      console.warn(`[yield] Aave APY fetch failed for chain ${chainId}:`, err);
    }

    // Aave available but fetch failed — return 0% as safe fallback
    return {
      chainId,
      protocol: 'aave',
      apy: 0,
      tokenAddress: tokens.aave.aUSDC,
    };
  }

  // ── No yield config at all — use Ethena even if fetch failed ──────────────
  const sUsdeAddress = tokens.ethena?.sUSDe ?? USDC_ADDRESSES[chainId];
  return {
    chainId,
    protocol: 'ethena',
    apy: 0,
    tokenAddress: sUsdeAddress,
  };
}

// ─── Main exports ─────────────────────────────────────────────────────────────

/**
 * Fetch yield data for all target chains concurrently.
 * Ethena APY is fetched once and shared (it is chain-agnostic).
 * Aave APY is fetched per chain in parallel.
 */
export async function fetchAllYields(): Promise<ChainYieldData[]> {
  // Fetch global APYs once — they apply to all chains where available
  const [ethenaSettled, skySettled] = await Promise.allSettled([fetchEthenaApy(), fetchSkyApy()]);

  if (ethenaSettled.status === 'rejected') {
    console.warn('[yield] Ethena APY fetch failed:', ethenaSettled.reason);
  }
  if (skySettled.status === 'rejected') {
    console.warn('[yield] Sky sUSDS APY fetch failed:', skySettled.reason);
  }

  const chainIds = Object.values(TARGET_CHAINS) as TargetChainId[];
  const results = await Promise.allSettled(
    chainIds.map((chainId) => fetchChainYield(chainId, ethenaSettled, skySettled)),
  );

  return results.map((res, i) => {
    const chainId = chainIds[i]!;
    if (res.status === 'fulfilled') return res.value;
    console.warn(`[yield] Yield fetch failed for chain ${chainId}:`, res.reason);
    // Safe fallback — Aave 0% or USDC address
    const tokens = YIELD_TOKENS[chainId];
    return {
      chainId,
      protocol: 'aave' as const,
      apy: 0,
      tokenAddress: tokens.aave?.aUSDC ?? USDC_ADDRESSES[chainId],
    };
  });
}

/**
 * Get the best yield token address for a chain (for routing purposes).
 * Synchronous — uses YIELD_TOKENS config only, no network call.
 * Priority: Ethena sUSDe > Aave aUSDC > USDC fallback.
 */
export function getBestYieldToken(chainId: TargetChainId): {
  address: string;
  protocol: 'sky' | 'ethena' | 'aave';
} {
  const tokens = YIELD_TOKENS[chainId];
  // Sky sUSDS is highest APY right now — prefer on Ethereum
  if (tokens.sky) {
    return { address: tokens.sky.sUSDS, protocol: 'sky' };
  }
  if (tokens.ethena) {
    return { address: tokens.ethena.sUSDe, protocol: 'ethena' };
  }
  if (tokens.aave) {
    return { address: tokens.aave.aUSDC, protocol: 'aave' };
  }
  return { address: USDC_ADDRESSES[chainId], protocol: 'aave' };
}

// ─── Multi-protocol ranked yield ──────────────────────────────────────────────

export interface YieldEntry {
  chainId: TargetChainId;
  protocol: 'sky' | 'ethena' | 'aave';
  apy: number;
  depositToken: string;
  vaultAddress: string;
}

/**
 * Fetch APY from all supported protocols (Ethena, Aave) for each chain
 * where config exists. Returns entries ranked by APY descending.
 *
 * Export: getYields() => YieldEntry[]
 */
export async function getYields(): Promise<YieldEntry[]> {
  // Fetch global APYs once (chain-agnostic)
  const [ethenaSettled, skySettled] = await Promise.allSettled([fetchEthenaApy(), fetchSkyApy()]);
  if (ethenaSettled.status === 'rejected') {
    console.warn('[yield] Ethena APY fetch failed:', ethenaSettled.reason);
  }
  if (skySettled.status === 'rejected') {
    console.warn('[yield] Sky sUSDS APY fetch failed:', skySettled.reason);
  }
  const ethenaApy = ethenaSettled.status === 'fulfilled' ? ethenaSettled.value : 0;
  const skyApy = skySettled.status === 'fulfilled' ? skySettled.value : 0;

  const chainIds = Object.values(TARGET_CHAINS) as TargetChainId[];
  const entries: YieldEntry[] = [];

  await Promise.allSettled(
    chainIds.flatMap((chainId) => {
      const tasks: Promise<void>[] = [];

      // Sky
      const skyConfig = YIELD_PROTOCOLS['sky']?.[chainId];
      if (skyConfig) {
        entries.push({
          chainId,
          protocol: 'sky',
          apy: skyApy,
          depositToken: skyConfig.depositToken,
          vaultAddress: skyConfig.vaultAddress,
        });
      }

      // Ethena
      const ethenaConfig = YIELD_PROTOCOLS['ethena']?.[chainId];
      if (ethenaConfig) {
        entries.push({
          chainId,
          protocol: 'ethena',
          apy: ethenaApy,
          depositToken: ethenaConfig.depositToken,
          vaultAddress: ethenaConfig.vaultAddress,
        });
      }

      // Aave
      const aaveConfig = YIELD_PROTOCOLS['aave']?.[chainId];
      if (aaveConfig) {
        const aaveTokens = YIELD_TOKENS[chainId];
        if (aaveTokens.aave) {
          tasks.push(
            fetchAaveApy(chainId)
              .then((apy) => {
                entries.push({
                  chainId,
                  protocol: 'aave',
                  apy,
                  depositToken: aaveConfig.depositToken,
                  vaultAddress: aaveConfig.vaultAddress,
                });
              })
              .catch((err) => {
                console.warn(`[yield] Aave APY fetch failed for chain ${chainId}:`, err);
                entries.push({
                  chainId,
                  protocol: 'aave',
                  apy: 0,
                  depositToken: aaveConfig.depositToken,
                  vaultAddress: aaveConfig.vaultAddress,
                });
              }),
          );
        }
      }

      return tasks;
    }),
  );

  // Sort by APY descending
  entries.sort((a, b) => b.apy - a.apy);
  return entries;
}
