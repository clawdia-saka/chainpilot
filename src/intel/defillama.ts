/**
 * DeFiLlama intel module
 * Fetches TVL change rate (24h) and DEX volume (24h) per chain.
 *
 * Endpoints used:
 *   https://api.llama.fi/v2/historicalChainTvl/{chain}  → TVL history (for Δ computation)
 *   https://api.llama.fi/overview/dexs/{chain}          → DEX volume 24h per chain
 */

import { TARGET_CHAINS } from '../config.js';
import type { TargetChainId } from '../config.js';

// ─── DeFiLlama chain name mapping ─────────────────────────────────────────────
// DeFiLlama uses human-readable names, not numeric chain IDs.

export const DEFILLAMA_CHAIN_NAMES: Record<TargetChainId, string> = {
  [TARGET_CHAINS.ETHEREUM]: 'Ethereum',
  [TARGET_CHAINS.OPTIMISM]: 'Optimism',
  [TARGET_CHAINS.POLYGON]: 'Polygon',
  [TARGET_CHAINS.ARBITRUM]: 'Arbitrum',
  [TARGET_CHAINS.BASE]: 'Base',
} as const;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ChainTvlData {
  chainId: TargetChainId;
  chainName: string;
  /** Current TVL in USD */
  tvlUsd: number;
  /** 24h TVL change in percent (positive = grew, negative = shrank) */
  tvlChange24hPct: number;
}

export interface ChainDexData {
  chainId: TargetChainId;
  chainName: string;
  /** Aggregated DEX volume in the last 24h (USD) */
  dexVolume24hUsd: number;
}

// ─── Internal API types ───────────────────────────────────────────────────────

interface HistoricalEntry {
  date: number;
  tvl: number;
}

interface DexOverviewResponse {
  total24h?: number;
  total48hto24h?: number; // previous 24h — used for comparison
  [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`DeFiLlama fetch failed [${res.status}]: ${url}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`DeFiLlama returned non-JSON [${res.status}]: ${text.slice(0, 100)}`);
  }
}

// ─── TVL ──────────────────────────────────────────────────────────────────────

/**
 * Fetch current TVL and 24h change for all 5 target chains in parallel.
 * Uses `/v2/historicalChainTvl/{chain}` — last two daily data points yield the Δ.
 */
export async function fetchChainTvl(): Promise<ChainTvlData[]> {
  const chainEntries = Object.entries(DEFILLAMA_CHAIN_NAMES) as [string, string][];

  const results = await Promise.allSettled(
    chainEntries.map(async ([chainIdStr, chainName]) => {
      const chainId = Number(chainIdStr) as TargetChainId;
      const url = `https://api.llama.fi/v2/historicalChainTvl/${chainName}`;
      const history = await fetchJson<HistoricalEntry[]>(url);

      if (!Array.isArray(history) || history.length < 2) {
        return { chainId, chainName, tvlUsd: 0, tvlChange24hPct: 0 };
      }

      const latest = history[history.length - 1]!;
      const prev = history[history.length - 2]!;
      const tvlUsd = latest.tvl;
      const tvlChange24hPct =
        prev.tvl > 0 ? ((latest.tvl - prev.tvl) / prev.tvl) * 100 : 0;

      return { chainId, chainName, tvlUsd, tvlChange24hPct };
    }),
  );

  return results.map((res, i) => {
    const [chainIdStr, chainName] = chainEntries[i]!;
    const chainId = Number(chainIdStr) as TargetChainId;
    if (res.status === 'fulfilled') return res.value;
    console.warn(`[defillama] TVL fetch failed for ${chainName}:`, res.reason);
    return { chainId, chainName, tvlUsd: 0, tvlChange24hPct: 0 };
  });
}

// ─── DEX Volume ───────────────────────────────────────────────────────────────

/**
 * Fetch 24h DEX volume for each target chain.
 * Calls `/overview/dexs/{chainName}` once per chain (5 parallel requests).
 *
 * Falls back to zero volume if the per-chain endpoint fails.
 */
export async function fetchDexVolume(): Promise<ChainDexData[]> {
  const chainEntries = Object.entries(DEFILLAMA_CHAIN_NAMES) as [string, string][];

  const results = await Promise.allSettled(
    chainEntries.map(async ([chainIdStr, chainName]) => {
      const chainId = Number(chainIdStr) as TargetChainId;
      const url = `https://api.llama.fi/overview/dexs/${chainName}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`;
      const data = await fetchJson<DexOverviewResponse>(url);
      const dexVolume24hUsd = typeof data.total24h === 'number' ? data.total24h : 0;
      return { chainId, chainName, dexVolume24hUsd };
    }),
  );

  return results.map((res, i) => {
    const [chainIdStr, chainName] = chainEntries[i]!;
    const chainId = Number(chainIdStr) as TargetChainId;
    if (res.status === 'fulfilled') return res.value;
    console.warn(`[defillama] DEX volume fetch failed for ${chainName}:`, res.reason);
    return { chainId, chainName, dexVolume24hUsd: 0 };
  });
}

// ─── Convenience: fetch both in one call ──────────────────────────────────────

export interface DefiLlamaIntel {
  tvl: ChainTvlData[];
  dex: ChainDexData[];
}

/** Fetch TVL data and DEX volume for all 5 chains concurrently. */
export async function fetchDefiLlamaIntel(): Promise<DefiLlamaIntel> {
  const [tvl, dex] = await Promise.all([fetchChainTvl(), fetchDexVolume()]);
  return { tvl, dex };
}
