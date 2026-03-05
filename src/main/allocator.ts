/**
 * Allocation engine
 *
 * Takes one or more SignalReports (supports averaging for stability),
 * the current portfolio balances, and produces:
 *   - A target allocation (fraction + USD per chain)
 *   - An ordered list of rebalancing moves
 *
 * Risk-adjusted scoring pipeline:
 *   1. Merge signals (mean score across reports)
 *   2. Apply risk multipliers (TVL size, score variance penalty)
 *   3. Cap per-chain weight at GUARDRAILS.MAX_CHAIN_ALLOCATION (40%)
 *   4. Re-normalise so weights sum to 1
 *   5. Generate moves (over-allocated → under-allocated), each ≤ MAX_TX_USD
 */

import { GUARDRAILS, SIGNAL_THRESHOLDS, TARGET_CHAINS } from '../config.js';
import type { TargetChainId } from '../config.js';
import type { SignalReport, ChainSignal } from '../intel/signal.js';

// ─── Public types ──────────────────────────────────────────────────────────────

/** Current USDC balances per chain in USD. Zero means no position. */
export type Portfolio = Partial<Record<TargetChainId, number>>;

export interface ChainAllocation {
  chainId: TargetChainId;
  chainName: string;
  /** Risk-adjusted score used for weighting */
  adjustedScore: number;
  /** Target weight in [0, 1] after capping and re-normalisation */
  targetWeight: number;
  /** Target USD value */
  targetUsd: number;
  /** Current USD value */
  currentUsd: number;
  /** Positive = need more funds; negative = excess to redeploy */
  deltaUsd: number;
}

export interface RebalancingMove {
  fromChainId: TargetChainId;
  toChainId: TargetChainId;
  fromChainName: string;
  toChainName: string;
  amountUsd: number;
  /** Reasoning driving this move */
  rationale: string;
}

export interface AllocationPlan {
  allocations: ChainAllocation[];
  moves: RebalancingMove[];
  totalPortfolioUsd: number;
  /** true when data quality was acceptable across all reports */
  dataQualityOk: boolean;
  /** ISO timestamp */
  createdAt: string;
  /** human-readable explanation of the plan */
  summary: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Merge per-chain signals from multiple reports.
 * Returns a map of chainId → merged ChainSignal (using the first report's
 * metadata but averaging numeric scores).
 */
function mergeSignals(reports: SignalReport[]): Map<TargetChainId, ChainSignal & { scoreStdDev: number }> {
  const byChain = new Map<TargetChainId, ChainSignal[]>();

  for (const report of reports) {
    for (const signal of report.chains) {
      const existing = byChain.get(signal.chainId) ?? [];
      existing.push(signal);
      byChain.set(signal.chainId, existing);
    }
  }

  const merged = new Map<TargetChainId, ChainSignal & { scoreStdDev: number }>();
  for (const [chainId, signals] of byChain) {
    const scores = signals.map((s) => s.score);
    const avgScore = mean(scores);
    const dev = stdDev(scores);
    const base = signals[signals.length - 1]!; // take latest for metadata
    merged.set(chainId, {
      ...base,
      score: avgScore,
      isCandidate: avgScore >= SIGNAL_THRESHOLDS.MIN_CONFIDENCE,
      scoreStdDev: dev,
    });
  }

  return merged;
}

/**
 * Apply risk multipliers to produce an adjusted score.
 *
 * Multipliers:
 *   - Score variance penalty: high stdDev across reports → uncertainty → discount
 *     penalty = exp(-2 * stdDev)  (stdDev=0 → 1.0, stdDev=0.5 → 0.37)
 *   - TVL size bonus: normalised log(TVL) adds up to 10% to score
 *     Only applied when TVL > 0; uses log scale to avoid dominance by Ethereum
 */
function applyRiskAdjustment(
  signal: ChainSignal & { scoreStdDev: number },
  maxTvlUsd: number,
): number {
  const variancePenalty = Math.exp(-2 * signal.scoreStdDev);

  let tvlBonus = 0;
  if (maxTvlUsd > 0 && signal.raw.tvlUsd > 0) {
    const normLog = Math.log1p(signal.raw.tvlUsd) / Math.log1p(maxTvlUsd);
    tvlBonus = 0.1 * normLog; // up to +10%
  }

  const adjusted = (signal.score + tvlBonus) * variancePenalty;
  return Math.min(Math.max(adjusted, 0), 1);
}

/**
 * Cap weights so no single chain exceeds MAX_CHAIN_ALLOCATION.
 * Excess weight is redistributed proportionally to uncapped chains.
 * Iterates until convergence (at most N passes).
 */
function capAndRenormalise(
  weights: Map<TargetChainId, number>,
  cap: number,
): Map<TargetChainId, number> {
  const result = new Map(weights);

  for (let pass = 0; pass < 10; pass++) {
    const total = [...result.values()].reduce((a, b) => a + b, 0);
    if (total === 0) break;

    // Normalise
    for (const [id, w] of result) result.set(id, w / total);

    // Find capped chains
    const capped = [...result.entries()].filter(([, w]) => w > cap);
    if (capped.length === 0) break;

    // Clamp capped chains and redistribute overflow
    let overflow = 0;
    for (const [id, w] of capped) {
      overflow += w - cap;
      result.set(id, cap);
    }

    // Distribute overflow to uncapped chains proportionally
    const uncapped = [...result.entries()].filter(([, w]) => w < cap);
    const uncappedTotal = uncapped.reduce((a, [, w]) => a + w, 0);
    if (uncappedTotal === 0) break;
    for (const [id, w] of uncapped) {
      result.set(id, w + overflow * (w / uncappedTotal));
    }
  }

  // Final normalise
  const total = [...result.values()].reduce((a, b) => a + b, 0);
  if (total > 0) for (const [id, w] of result) result.set(id, w / total);

  return result;
}

/**
 * Generate rebalancing moves from current portfolio to target allocations.
 * Moves go from chains with excess to chains with deficit,
 * each capped at MAX_TX_USD, and at most MAX_MOVES_PER_DAY total.
 */
function generateMoves(allocations: ChainAllocation[]): RebalancingMove[] {
  // Sort: sources have negative delta (excess), sinks have positive delta (need)
  const sources = allocations
    .filter((a) => a.deltaUsd < -0.01)
    .sort((a, b) => a.deltaUsd - b.deltaUsd); // most excess first

  const sinks = allocations
    .filter((a) => a.deltaUsd > 0.01)
    .sort((a, b) => b.deltaUsd - a.deltaUsd); // most needed first

  const moves: RebalancingMove[] = [];
  const remaining: Map<TargetChainId, number> = new Map(
    sources.map((s) => [s.chainId, Math.abs(s.deltaUsd)]),
  );
  const needed: Map<TargetChainId, number> = new Map(
    sinks.map((s) => [s.chainId, s.deltaUsd]),
  );

  for (const sink of sinks) {
    let stillNeeded = needed.get(sink.chainId) ?? 0;

    for (const source of sources) {
      if (stillNeeded <= 0) break;
      if (moves.length >= GUARDRAILS.MAX_MOVES_PER_DAY) break;

      const available = remaining.get(source.chainId) ?? 0;
      if (available <= 0) continue;

      const transferable = Math.min(available, stillNeeded, GUARDRAILS.MAX_TX_USD);
      if (transferable < 0.01) continue;

      moves.push({
        fromChainId: source.chainId,
        toChainId: sink.chainId,
        fromChainName: source.chainName,
        toChainName: sink.chainName,
        amountUsd: Math.round(transferable * 100) / 100,
        rationale:
          `Move $${transferable.toFixed(2)} from ${source.chainName} ` +
          `(over-allocated by $${Math.abs(source.deltaUsd).toFixed(2)}) ` +
          `to ${sink.chainName} (under-allocated by $${sink.deltaUsd.toFixed(2)}, ` +
          `score ${sink.adjustedScore.toFixed(3)})`,
      });

      remaining.set(source.chainId, available - transferable);
      stillNeeded -= transferable;
    }
  }

  return moves;
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute an allocation plan from one or more signal reports and the
 * current portfolio state.
 *
 * @param reports  One or more SignalReports (multiple = averaged for stability)
 * @param portfolio Current USDC balance per chain in USD
 */
export function computeAllocation(reports: SignalReport[], portfolio: Portfolio): AllocationPlan {
  if (reports.length === 0) throw new Error('allocator: at least one SignalReport required');

  const dataQualityOk = reports.every((r) => r.dataQualityOk);
  const merged = mergeSignals(reports);

  // Total portfolio value
  const chainIds = Object.values(TARGET_CHAINS) as TargetChainId[];
  const totalPortfolioUsd = chainIds.reduce((sum, id) => sum + (portfolio[id] ?? 0), 0);

  // Find max TVL across candidates for normalisation
  const maxTvlUsd = Math.max(
    ...[...merged.values()].map((s) => s.raw.tvlUsd),
    0,
  );

  // Compute adjusted scores for candidate chains only
  const candidates = [...merged.entries()]
    .filter(([, s]) => s.isCandidate)
    .map(([id, s]) => ({ id, signal: s, adjustedScore: applyRiskAdjustment(s, maxTvlUsd) }))
    .filter((c) => c.adjustedScore > 0);

  let finalWeights: Map<TargetChainId, number>;

  if (candidates.length === 0) {
    // No candidates: hold current allocation (no moves)
    finalWeights = new Map(
      chainIds.map((id) => [
        id,
        totalPortfolioUsd > 0 ? (portfolio[id] ?? 0) / totalPortfolioUsd : 0,
      ]),
    );
  } else {
    // ── Protocol dedup: same protocol across chains → keep cheapest chain ──────
    // If multiple chains offer the same yield protocol (e.g. Ethena sUSDe),
    // bridging to multiple chains wastes gas for zero diversification benefit.
    // Keep only the chain with the highest adjusted score per protocol.
    // Different protocols (e.g. Ethena on Eth + Aave on Base) are preserved.
    const bestByProtocol = new Map<string, { id: TargetChainId; score: number; cost: number }>();
    const dedupedCandidates: typeof candidates = [];

    for (const c of candidates) {
      const signal = merged.get(c.id);
      const protocol = signal?.yieldProtocol ?? 'none';
      const existing = bestByProtocol.get(protocol);
      // Same protocol, same APY → pick cheapest chain (lowest bridge cost).
      // If no bridge cost data, fall back to adjusted score.
      const bridgeCost = signal?.raw.bridgeCostUsd ?? Infinity;
      const existingCost = existing?.cost ?? Infinity;

      if (!existing || bridgeCost < existingCost || (bridgeCost === existingCost && c.adjustedScore > existing.score)) {
        bestByProtocol.set(protocol, { id: c.id, score: c.adjustedScore, cost: bridgeCost });
      }
    }

    // Build deduped list: for each protocol keep only the best chain,
    // plus any chain whose best protocol differs from others
    const protocolBestChains = new Set([...bestByProtocol.values()].map((v) => v.id));

    for (const c of candidates) {
      const signal = merged.get(c.id);
      const protocol = signal?.yieldProtocol ?? 'none';
      const best = bestByProtocol.get(protocol);

      if (best && best.id === c.id) {
        // This is the best chain for this protocol — keep it
        dedupedCandidates.push(c);
      } else if (signal?.yieldProtocol && signal.yieldProtocol !== 'none') {
        // Same protocol, not the best chain — check if this chain has a DIFFERENT
        // secondary protocol that isn't covered yet
        // For now: skip (same protocol = no value in multi-chain)
        console.log(
          `[allocator] Dedup: skipping ${signal.chainName} for ${protocol} ` +
          `(${c.adjustedScore.toFixed(3)} < best ${best?.score.toFixed(3)} on chain ${best?.id})`,
        );
      } else {
        dedupedCandidates.push(c);
      }
    }

    // Build raw weight map from deduped candidates
    const rawWeights = new Map<TargetChainId, number>(chainIds.map((id) => [id, 0]));
    for (const { id, adjustedScore } of dedupedCandidates) {
      rawWeights.set(id, adjustedScore);
    }
    finalWeights = capAndRenormalise(rawWeights, GUARDRAILS.MAX_CHAIN_ALLOCATION);
  }

  // Build allocation objects
  const allocations: ChainAllocation[] = chainIds.map((id) => {
    const signal = merged.get(id);
    const adjustedScore = candidates.find((c) => c.id === id)?.adjustedScore ?? 0;
    const targetWeight = finalWeights.get(id) ?? 0;
    const currentUsd = portfolio[id] ?? 0;
    const targetUsd = totalPortfolioUsd * targetWeight;
    return {
      chainId: id,
      chainName: signal?.chainName ?? String(id),
      adjustedScore,
      targetWeight,
      targetUsd: Math.round(targetUsd * 100) / 100,
      currentUsd,
      deltaUsd: Math.round((targetUsd - currentUsd) * 100) / 100,
    };
  });

  const moves = totalPortfolioUsd > 0 && candidates.length > 0
    ? generateMoves(allocations)
    : [];

  // Build summary
  const topAllocs = allocations
    .filter((a) => a.targetWeight > 0)
    .sort((a, b) => b.targetWeight - a.targetWeight)
    .slice(0, 3)
    .map((a) => `${a.chainName} ${(a.targetWeight * 100).toFixed(0)}%`)
    .join(', ');

  const summary = candidates.length === 0
    ? 'No chains meet confidence threshold — holding current positions.'
    : `Target: ${topAllocs}. ${moves.length} move(s) queued across $${totalPortfolioUsd.toFixed(2)} portfolio.`;

  return {
    allocations,
    moves,
    totalPortfolioUsd,
    dataQualityOk,
    createdAt: new Date().toISOString(),
    summary,
  };
}
