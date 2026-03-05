/**
 * LI.FI scanner module
 * Scans bridge connections, USDC token prices, and route costs
 * across all 5 target chains using the lifi REST client.
 *
 * Data collected per chain:
 *   - Outbound bridge connections available (to other target chains)
 *   - USDC price in USD (should be ~$1; deviation signals de-peg risk)
 *   - Cheapest bridge cost (USD) to move USDC out of this chain
 */

import { lifi } from '../lifi/client.js';
import { TARGET_CHAINS, USDC_ADDRESSES, WALLET, GUARDRAILS } from '../config.js';
import type { TargetChainId } from '../config.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ChainConnectivity {
  chainId: TargetChainId;
  /** Number of outbound connections to other target chains */
  outboundConnections: number;
  /** Chain IDs reachable from this chain (subset of target chains) */
  reachableChains: TargetChainId[];
}

export interface ChainTokenPrice {
  chainId: TargetChainId;
  /** USDC price in USD (from LI.FI token data) */
  usdcPriceUsd: number;
}

export interface ChainRouteCost {
  chainId: TargetChainId;
  /** Destination chain for this route sample */
  toChainId: TargetChainId;
  /** Total estimated bridge cost in USD (gas + fees) */
  totalCostUsd: number;
  /** Expected USDC received on destination (USD value) */
  toAmountUsd: number;
  /** Bridge tool used (e.g. "stargate", "across") */
  tool: string;
}

export interface LiFiScanResult {
  connectivity: ChainConnectivity[];
  tokenPrices: ChainTokenPrice[];
  routeCosts: ChainRouteCost[];
  /** ISO timestamp of scan */
  scannedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_CHAIN_IDS = Object.values(TARGET_CHAINS) as TargetChainId[];

/**
 * Sample amount for route cost estimation: $10 USDC (6 decimals)
 * Chosen to stay within GUARDRAILS.MAX_TX_USD ($20) but give meaningful fee data.
 */
const SAMPLE_AMOUNT_USDC = '10000000'; // 10 USDC in base units

// ─── Connectivity scan ────────────────────────────────────────────────────────

/**
 * For each chain, check which other target chains it can bridge USDC to.
 * Uses lifi.getConnections() with USDC on both ends.
 */
async function scanConnectivity(): Promise<ChainConnectivity[]> {
  const results = await Promise.allSettled(
    TARGET_CHAIN_IDS.map(async (fromChainId) => {
      const fromToken = USDC_ADDRESSES[fromChainId];
      const reachableChains: TargetChainId[] = [];

      // Check connections to each other target chain
      const connectionChecks = await Promise.allSettled(
        TARGET_CHAIN_IDS.filter((id) => id !== fromChainId).map(async (toChainId) => {
          const toToken = USDC_ADDRESSES[toChainId];
          const res = await lifi.getConnections({
            fromChain: fromChainId,
            toChain: toChainId,
            fromToken,
            toToken,
            chainTypes: 'EVM',
          });
          if (res.connections.length > 0) {
            return toChainId;
          }
          return null;
        }),
      );

      for (const check of connectionChecks) {
        if (check.status === 'fulfilled' && check.value !== null) {
          reachableChains.push(check.value);
        }
      }

      return {
        chainId: fromChainId,
        outboundConnections: reachableChains.length,
        reachableChains,
      };
    }),
  );

  return results.map((res, i) => {
    const chainId = TARGET_CHAIN_IDS[i]!;
    if (res.status === 'fulfilled') return res.value;
    console.warn(`[lifi-scanner] Connectivity scan failed for chain ${chainId}:`, res.reason);
    return { chainId, outboundConnections: 0, reachableChains: [] };
  });
}

// ─── Token price scan ─────────────────────────────────────────────────────────

/**
 * Fetch USDC price on each chain from LI.FI token data.
 * Deviation from $1.00 is a risk signal.
 */
async function scanTokenPrices(): Promise<ChainTokenPrice[]> {
  const chainIds = Object.values(TARGET_CHAINS).join(',');
  let tokenMap: Record<string, Array<{ address: string; priceUSD?: string }>> = {};

  try {
    const res = await lifi.getTokens({ chains: chainIds, chainTypes: 'EVM' });
    tokenMap = res.tokens;
  } catch (err) {
    console.warn('[lifi-scanner] Token price fetch failed:', err);
  }

  return TARGET_CHAIN_IDS.map((chainId) => {
    const chainTokens = tokenMap[String(chainId)] ?? [];
    const usdcAddress = USDC_ADDRESSES[chainId].toLowerCase();
    const usdcToken = chainTokens.find(
      (t) => t.address.toLowerCase() === usdcAddress,
    );
    const usdcPriceUsd = usdcToken?.priceUSD ? parseFloat(usdcToken.priceUSD) : 1.0;
    return { chainId, usdcPriceUsd };
  });
}

// ─── Route cost scan ──────────────────────────────────────────────────────────

/**
 * Sample bridge cost for moving 10 USDC from each chain to a representative destination.
 * Picks the lowest-cost route available. Uses GUARDRAILS.ROUTE_ORDER for ordering.
 *
 * To keep request count bounded, each chain picks ONE destination: the next chain
 * in the rotation (ETH→OP, OP→POLY, POLY→ARB, ARB→BASE, BASE→ETH).
 */
async function scanRouteCosts(): Promise<ChainRouteCost[]> {
  const pairs: Array<[TargetChainId, TargetChainId]> = TARGET_CHAIN_IDS.map(
    (id, idx) => [id, TARGET_CHAIN_IDS[(idx + 1) % TARGET_CHAIN_IDS.length]!],
  );

  const results = await Promise.allSettled(
    pairs.map(async ([fromChainId, toChainId]) => {
      const res = await lifi.getRoutes({
        fromChainId,
        toChainId,
        fromTokenAddress: USDC_ADDRESSES[fromChainId],
        toTokenAddress: USDC_ADDRESSES[toChainId],
        fromAmount: SAMPLE_AMOUNT_USDC,
        fromAddress: WALLET.ADDRESS,
        options: {
          slippage: GUARDRAILS.MAX_SLIPPAGE,
          order: GUARDRAILS.ROUTE_ORDER,
        },
      });

      if (!res.routes.length) {
        return {
          chainId: fromChainId,
          toChainId,
          totalCostUsd: Infinity,
          toAmountUsd: 0,
          tool: 'none',
        };
      }

      const best = res.routes[0]!;
      const gasCostUsd = parseFloat(best.gasCostUSD ?? '0');
      // Sum fee costs across all steps
      const feeCostUsd = best.steps.reduce((acc, step) => {
        const stepFees = step.estimate.feeCosts.reduce(
          (sum, fee) => sum + parseFloat(fee.amountUSD ?? '0'),
          0,
        );
        return acc + stepFees;
      }, 0);

      return {
        chainId: fromChainId,
        toChainId,
        totalCostUsd: gasCostUsd + feeCostUsd,
        toAmountUsd: parseFloat(best.toAmountUSD ?? '0'),
        tool: best.steps[0]?.tool ?? 'unknown',
      };
    }),
  );

  return results.map((res, i) => {
    const [fromChainId, toChainId] = pairs[i]!;
    if (res.status === 'fulfilled') return res.value;
    console.warn(
      `[lifi-scanner] Route cost scan failed for chain ${fromChainId} → ${toChainId}:`,
      res.reason,
    );
    return {
      chainId: fromChainId,
      toChainId,
      totalCostUsd: Infinity,
      toAmountUsd: 0,
      tool: 'error',
    };
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Run all three scans concurrently and return the combined LiFiScanResult.
 */
export async function scanLiFi(): Promise<LiFiScanResult> {
  const [connectivity, tokenPrices, routeCosts] = await Promise.all([
    scanConnectivity(),
    scanTokenPrices(),
    scanRouteCosts(),
  ]);

  return {
    connectivity,
    tokenPrices,
    routeCosts,
    scannedAt: new Date().toISOString(),
  };
}
