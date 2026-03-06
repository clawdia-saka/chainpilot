/**
 * Signal aggregator
 * Combines DeFiLlama TVL/DEX data and LI.FI scan results into a SignalReport.
 *
 * Per-chain score (0–1) is a weighted sum of three sub-scores:
 *   tvlScore     (40%) — based on 24h TVL change vs SIGNAL_THRESHOLDS
 *   volumeScore  (35%) — normalised DEX volume relative to the highest-volume chain
 *   accessScore  (25%) — inverse of bridge cost (cheaper = more accessible)
 *
 * A chain with score ≥ SIGNAL_THRESHOLDS.MIN_CONFIDENCE is a candidate for allocation.
 */

import { SIGNAL_THRESHOLDS, TARGET_CHAINS } from '../config.js';
import type { TargetChainId } from '../config.js';
import type { ChainTvlData, ChainDexData } from './defillama.js';
import type { ChainConnectivity, ChainTokenPrice, ChainRouteCost } from './lifi-scanner.js';
import type { ChainYieldData } from './yield.js';
import { fetchDefiLlamaIntel } from './defillama.js';
import { scanLiFi } from './lifi-scanner.js';
import { fetchAllYields, getYields } from './yield.js';
import type { YieldEntry } from './yield.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ChainSignal {
  chainId: TargetChainId;
  chainName: string;
  /** Composite score in [0, 1]. Higher = more attractive for allocation. */
  score: number;
  /** Sub-scores for transparency */
  breakdown: {
    tvlScore: number;
    volumeScore: number;
    accessScore: number;
    yieldScore: number;
  };
  /** Raw inputs used for scoring */
  raw: {
    tvlUsd: number;
    tvlChange24hPct: number;
    dexVolume24hUsd: number;
    usdcPriceUsd: number;
    outboundConnections: number;
    bridgeCostUsd: number;
  };
  /** Best yield APY (percent) for this chain */
  yieldApy: number;
  /** Yield protocol providing the best APY */
  yieldProtocol: 'sky' | 'ethena' | 'aave' | 'none';
  /** All yield options for this chain, ranked by APY descending */
  yieldOptions: YieldEntry[];
  /** true if score ≥ MIN_CONFIDENCE threshold */
  isCandidate: boolean;
}

export interface SignalReport {
  /** Per-chain signals, sorted by score descending */
  chains: ChainSignal[];
  /** Top-ranked chain ID */
  topChain: TargetChainId;
  /** ISO timestamp of when this report was generated */
  generatedAt: string;
  /** Report quality flag — false if any data source returned zeros for all chains */
  dataQualityOk: boolean;
  /** All yield options across all chains, ranked by APY descending */
  yieldOptions: YieldEntry[];
}

// ─── Score helpers ────────────────────────────────────────────────────────────

/**
 * TVL change → sub-score in [0, 1].
 *
 * Mapping:
 *   change ≥ POSITIVE_PCT  → 1.0
 *   change ≤ NEGATIVE_PCT  → 0.0
 *   between                → linear interpolation
 */
function tvlChangeToScore(changePct: number): number {
  const { TVL_CHANGE_POSITIVE_PCT, TVL_CHANGE_NEGATIVE_PCT } = SIGNAL_THRESHOLDS;
  if (changePct >= TVL_CHANGE_POSITIVE_PCT) return 1.0;
  if (changePct <= TVL_CHANGE_NEGATIVE_PCT) return 0.0;
  // Linear scale from NEGATIVE_PCT to POSITIVE_PCT
  const range = TVL_CHANGE_POSITIVE_PCT - TVL_CHANGE_NEGATIVE_PCT;
  return (changePct - TVL_CHANGE_NEGATIVE_PCT) / range;
}

/**
 * Normalise DEX volume vs the max across all chains → sub-score in [0, 1].
 */
function volumeToScore(volume: number, maxVolume: number): number {
  if (maxVolume <= 0) return 0.5; // No data — neutral
  return Math.min(volume / maxVolume, 1.0);
}

/**
 * Bridge cost → sub-score in [0, 1].
 * Lower cost = better access = higher score.
 *
 * Uses exponential decay: score = exp(−cost / REF_COST)
 * REF_COST = $2 (typical L2 bridge cost) → score 0.37 at $2, 1.0 at $0.
 */
function bridgeCostToScore(costUsd: number): number {
  if (!isFinite(costUsd) || costUsd < 0) return 0;
  const REF_COST = 2.0; // USD reference for 50th-percentile cost
  return Math.exp(-costUsd / REF_COST);
}

/**
 * Yield APY → sub-score in [0, 1].
 * REF_APY = 10% → score 1.0; linear below, capped above.
 */
function yieldApyToScore(apy: number): number {
  if (!isFinite(apy) || apy < 0) return 0;
  const REF_APY = 10.0; // 10% APY = full score
  return Math.min(apy / REF_APY, 1.0);
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

function findTvl(tvl: ChainTvlData[], chainId: TargetChainId): ChainTvlData {
  return (
    tvl.find((d) => d.chainId === chainId) ?? {
      chainId,
      chainName: String(chainId),
      tvlUsd: 0,
      tvlChange24hPct: 0,
    }
  );
}

function findDex(dex: ChainDexData[], chainId: TargetChainId): ChainDexData {
  return (
    dex.find((d) => d.chainId === chainId) ?? {
      chainId,
      chainName: String(chainId),
      dexVolume24hUsd: 0,
    }
  );
}

function findPrice(prices: ChainTokenPrice[], chainId: TargetChainId): ChainTokenPrice {
  return prices.find((p) => p.chainId === chainId) ?? { chainId, usdcPriceUsd: 1.0 };
}

function findConnectivity(
  connectivity: ChainConnectivity[],
  chainId: TargetChainId,
): ChainConnectivity {
  return (
    connectivity.find((c) => c.chainId === chainId) ?? {
      chainId,
      outboundConnections: 0,
      reachableChains: [],
    }
  );
}

function findRouteCost(costs: ChainRouteCost[], chainId: TargetChainId): number {
  const cost = costs.find((r) => r.chainId === chainId);
  return cost ? cost.totalCostUsd : Infinity;
}

function findYield(yields: ChainYieldData[], chainId: TargetChainId): ChainYieldData {
  return (
    yields.find((y) => y.chainId === chainId) ?? {
      chainId,
      protocol: 'aave' as const,
      apy: 0,
      tokenAddress: '',
    }
  );
}

// ─── Chain name map (for display) ─────────────────────────────────────────────

const CHAIN_NAMES: Record<TargetChainId, string> = {
  [TARGET_CHAINS.ETHEREUM]: 'Ethereum',
  [TARGET_CHAINS.OPTIMISM]: 'Optimism',
  [TARGET_CHAINS.POLYGON]: 'Polygon',
  [TARGET_CHAINS.ARBITRUM]: 'Arbitrum',
  [TARGET_CHAINS.BASE]: 'Base',
} as const;

// ─── Aggregation ──────────────────────────────────────────────────────────────

// Weights sum to 1.0. Yield contributes 20%; others scaled down proportionally.
const WEIGHTS = {
  tvl: 0.35,
  volume: 0.25,
  access: 0.20,
  yield: 0.20,
} as const;

/**
 * Aggregate raw intel data into a SignalReport.
 * All inputs are passed explicitly so callers can provide fresh or cached data.
 */
export function aggregateSignals(
  tvlData: ChainTvlData[],
  dexData: ChainDexData[],
  connectivity: ChainConnectivity[],
  tokenPrices: ChainTokenPrice[],
  routeCosts: ChainRouteCost[],
  yieldData: ChainYieldData[],
  allYieldEntries: YieldEntry[] = [],
): SignalReport {
  const chainIds = Object.values(TARGET_CHAINS) as TargetChainId[];
  const maxVolume = Math.max(...dexData.map((d) => d.dexVolume24hUsd), 0);

  const chains: ChainSignal[] = chainIds.map((chainId) => {
    const tvl = findTvl(tvlData, chainId);
    const dex = findDex(dexData, chainId);
    const price = findPrice(tokenPrices, chainId);
    const conn = findConnectivity(connectivity, chainId);
    const bridgeCostUsd = findRouteCost(routeCosts, chainId);
    const yld = findYield(yieldData, chainId);

    const tvlScore = tvlChangeToScore(tvl.tvlChange24hPct);
    const volumeScore = volumeToScore(dex.dexVolume24hUsd, maxVolume);
    const accessScore = bridgeCostToScore(bridgeCostUsd);
    const yieldScore = yieldApyToScore(yld.apy);

    const score =
      WEIGHTS.tvl * tvlScore +
      WEIGHTS.volume * volumeScore +
      WEIGHTS.access * accessScore +
      WEIGHTS.yield * yieldScore;

    // USDC de-peg penalty: if price deviates >1% from $1, reduce score by 20%
    const usdcDeviation = Math.abs(price.usdcPriceUsd - 1.0);
    const finalScore = usdcDeviation > 0.01 ? score * 0.8 : score;

    // Per-chain yield options (ranked by APY descending)
    const chainYieldOptions = allYieldEntries.filter((e) => e.chainId === chainId);

    return {
      chainId,
      chainName: CHAIN_NAMES[chainId],
      score: Math.min(Math.max(finalScore, 0), 1),
      breakdown: { tvlScore, volumeScore, accessScore, yieldScore },
      raw: {
        tvlUsd: tvl.tvlUsd,
        tvlChange24hPct: tvl.tvlChange24hPct,
        dexVolume24hUsd: dex.dexVolume24hUsd,
        usdcPriceUsd: price.usdcPriceUsd,
        outboundConnections: conn.outboundConnections,
        bridgeCostUsd: isFinite(bridgeCostUsd) ? bridgeCostUsd : -1,
      },
      yieldApy: yld.apy,
      yieldProtocol: yld.protocol,
      yieldOptions: chainYieldOptions,
      isCandidate: finalScore >= SIGNAL_THRESHOLDS.MIN_CONFIDENCE,
    };
  });

  // Sort descending by score
  chains.sort((a, b) => b.score - a.score);

  // Data quality: check at least one chain has non-zero TVL and volume
  const hasTvl = tvlData.some((d) => d.tvlUsd > 0);
  const hasVolume = dexData.some((d) => d.dexVolume24hUsd > 0);

  return {
    chains,
    topChain: chains[0]!.chainId,
    generatedAt: new Date().toISOString(),
    dataQualityOk: hasTvl && hasVolume,
    yieldOptions: allYieldEntries,
  };
}

// ─── Full pipeline ────────────────────────────────────────────────────────────

/**
 * Fetch all intel data and return a complete SignalReport.
 * This is the main entry point for Phase 2 intel.
 */
export async function generateSignalReport(): Promise<SignalReport> {
  const [{ tvl, dex }, lifiScan, yieldData, allYieldEntries] = await Promise.all([
    fetchDefiLlamaIntel(),
    scanLiFi(),
    fetchAllYields(),
    getYields(),
  ]);

  return aggregateSignals(
    tvl,
    dex,
    lifiScan.connectivity,
    lifiScan.tokenPrices,
    lifiScan.routeCosts,
    yieldData,
    allYieldEntries,
  );
}
