// src/config.ts
import { readFileSync } from "fs";
var TARGET_CHAINS = {
  ETHEREUM: 1,
  OPTIMISM: 10,
  POLYGON: 137,
  ARBITRUM: 42161,
  BASE: 8453
};
var CHAIN_IDS_CSV = Object.values(TARGET_CHAINS).join(",");
var USDC_ADDRESSES = {
  [TARGET_CHAINS.ETHEREUM]: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  [TARGET_CHAINS.OPTIMISM]: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  [TARGET_CHAINS.POLYGON]: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  [TARGET_CHAINS.ARBITRUM]: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  [TARGET_CHAINS.BASE]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
};
var GUARDRAILS = {
  /** Maximum allocation fraction per chain (0–1) */
  MAX_CHAIN_ALLOCATION: 0.4,
  /** Maximum USD value per transaction */
  MAX_TX_USD: 20,
  /** Maximum bridge/swap moves per day */
  MAX_MOVES_PER_DAY: 6,
  /** Maximum acceptable slippage (LI.FI uses decimal, e.g. 0.015 = 1.5%) */
  MAX_SLIPPAGE: 0.015,
  /** Number of retries on bridge failure before stopping */
  MAX_RETRIES: 1,
  /** Default bridge order preference */
  ROUTE_ORDER: "RECOMMENDED"
};
var SIGNAL_THRESHOLDS = {
  /** Minimum TVL change % (24h) to register as a positive signal */
  TVL_CHANGE_POSITIVE_PCT: 5,
  /** TVL change % below this is a negative signal */
  TVL_CHANGE_NEGATIVE_PCT: -5,
  /** Minimum confidence score (0–1) to execute a trade */
  MIN_CONFIDENCE: 0.65
};
var WALLET = {
  ADDRESS: "0xBB6FdC629a153E2bF7629032A3Bf99aec8b48938",
  /** Loaded at runtime — never hardcoded */
  KEY_FILE: `${process.env.HOME}/.config/clawnch/wallet.json`
};
var RPC_URLS = {
  [TARGET_CHAINS.ETHEREUM]: "https://eth.llamarpc.com",
  [TARGET_CHAINS.OPTIMISM]: "https://mainnet.optimism.io",
  [TARGET_CHAINS.POLYGON]: "https://polygon-bor-rpc.publicnode.com",
  [TARGET_CHAINS.ARBITRUM]: "https://arb1.arbitrum.io/rpc",
  [TARGET_CHAINS.BASE]: "https://mainnet.base.org"
};
var YIELD_TOKENS = {
  [TARGET_CHAINS.ETHEREUM]: {
    ethena: { sUSDe: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497" },
    aave: {
      aUSDC: "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c",
      poolAddress: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"
    }
  },
  [TARGET_CHAINS.OPTIMISM]: {
    aave: {
      aUSDC: "0x38d693cE1dF5AaDF7bC62595A37D667aD57922e5",
      poolAddress: "0x794a61358D6845594F94dc1DB02A252b5b4814aD"
    }
  },
  [TARGET_CHAINS.POLYGON]: {
    aave: {
      aUSDC: "0xA4D94019934D8333Ef880ABFFbF2FDd611C762BD",
      poolAddress: "0x794a61358D6845594F94dc1DB02A252b5b4814aD"
    }
  },
  [TARGET_CHAINS.ARBITRUM]: {
    ethena: { sUSDe: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2" },
    aave: {
      aUSDC: "0x724dc807b04555b71ed48a6896b6F41593b8C637",
      poolAddress: "0x794a61358D6845594F94dc1DB02A252b5b4814aD"
    }
  },
  [TARGET_CHAINS.BASE]: {
    ethena: { sUSDe: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2" },
    aave: {
      aUSDC: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
      poolAddress: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"
    }
  }
};
var YIELD_PROTOCOLS = {
  ethena: {
    [TARGET_CHAINS.ETHEREUM]: {
      depositToken: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
      // sUSDe (18 dec)
      vaultAddress: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
      decimals: 18
    },
    [TARGET_CHAINS.BASE]: {
      depositToken: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2",
      // sUSDe (18 dec)
      vaultAddress: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2",
      decimals: 18
    },
    [TARGET_CHAINS.ARBITRUM]: {
      depositToken: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2",
      // sUSDe (18 dec)
      vaultAddress: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2",
      decimals: 18
    }
  },
  aave: {
    [TARGET_CHAINS.ETHEREUM]: {
      depositToken: "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c",
      // aUSDC (6 dec)
      vaultAddress: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
      decimals: 6
    },
    [TARGET_CHAINS.BASE]: {
      depositToken: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
      // aUSDC (6 dec)
      vaultAddress: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
      decimals: 6
    },
    [TARGET_CHAINS.ARBITRUM]: {
      depositToken: "0x724dc807b04555b71ed48a6896b6F41593b8C637",
      // aUSDC (6 dec)
      vaultAddress: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
      decimals: 6
    },
    [TARGET_CHAINS.OPTIMISM]: {
      depositToken: "0x38d693cE1dF5AaDF7bC62595A37D667aD57922e5",
      // aUSDC (6 dec)
      vaultAddress: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
      decimals: 6
    },
    [TARGET_CHAINS.POLYGON]: {
      depositToken: "0xA4D94019934D8333Ef880ABFFbF2FDd611C762BD",
      // aUSDC (6 dec)
      vaultAddress: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
      decimals: 6
    }
  }
};
function loadLifiApiKey() {
  if (process.env.LIFI_API_KEY) return process.env.LIFI_API_KEY;
  try {
    const cred = JSON.parse(
      readFileSync(`${process.env.HOME}/.openclaw/credentials/lifi-api.json`, "utf-8")
    );
    return cred.api_key ?? "";
  } catch {
    return "";
  }
}
var LIFI_API_KEY = loadLifiApiKey();

// src/intel/defillama.ts
var DEFILLAMA_CHAIN_NAMES = {
  [TARGET_CHAINS.ETHEREUM]: "Ethereum",
  [TARGET_CHAINS.OPTIMISM]: "Optimism",
  [TARGET_CHAINS.POLYGON]: "Polygon",
  [TARGET_CHAINS.ARBITRUM]: "Arbitrum",
  [TARGET_CHAINS.BASE]: "Base"
};
async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15e3) });
  if (!res.ok) {
    throw new Error(`DeFiLlama fetch failed [${res.status}]: ${url}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`DeFiLlama returned non-JSON [${res.status}]: ${text.slice(0, 100)}`);
  }
}
async function fetchChainTvl() {
  const chainEntries = Object.entries(DEFILLAMA_CHAIN_NAMES);
  const results = await Promise.allSettled(
    chainEntries.map(async ([chainIdStr, chainName]) => {
      const chainId = Number(chainIdStr);
      const url = `https://api.llama.fi/v2/historicalChainTvl/${chainName}`;
      const history = await fetchJson(url);
      if (!Array.isArray(history) || history.length < 2) {
        return { chainId, chainName, tvlUsd: 0, tvlChange24hPct: 0 };
      }
      const latest = history[history.length - 1];
      const prev = history[history.length - 2];
      const tvlUsd = latest.tvl;
      const tvlChange24hPct = prev.tvl > 0 ? (latest.tvl - prev.tvl) / prev.tvl * 100 : 0;
      return { chainId, chainName, tvlUsd, tvlChange24hPct };
    })
  );
  return results.map((res, i) => {
    const [chainIdStr, chainName] = chainEntries[i];
    const chainId = Number(chainIdStr);
    if (res.status === "fulfilled") return res.value;
    console.warn(`[defillama] TVL fetch failed for ${chainName}:`, res.reason);
    return { chainId, chainName, tvlUsd: 0, tvlChange24hPct: 0 };
  });
}
async function fetchDexVolume() {
  const chainEntries = Object.entries(DEFILLAMA_CHAIN_NAMES);
  const results = await Promise.allSettled(
    chainEntries.map(async ([chainIdStr, chainName]) => {
      const chainId = Number(chainIdStr);
      const url = `https://api.llama.fi/overview/dexs/${chainName}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`;
      const data = await fetchJson(url);
      const dexVolume24hUsd = typeof data.total24h === "number" ? data.total24h : 0;
      return { chainId, chainName, dexVolume24hUsd };
    })
  );
  return results.map((res, i) => {
    const [chainIdStr, chainName] = chainEntries[i];
    const chainId = Number(chainIdStr);
    if (res.status === "fulfilled") return res.value;
    console.warn(`[defillama] DEX volume fetch failed for ${chainName}:`, res.reason);
    return { chainId, chainName, dexVolume24hUsd: 0 };
  });
}
async function fetchDefiLlamaIntel() {
  const [tvl, dex] = await Promise.all([fetchChainTvl(), fetchDexVolume()]);
  return { tvl, dex };
}

// src/lifi/client.ts
import { readFileSync as readFileSync2 } from "fs";
var BASE_URL = "https://li.quest/v1";
function loadApiKey() {
  if (process.env.LIFI_API_KEY) return process.env.LIFI_API_KEY;
  try {
    const cred = JSON.parse(
      readFileSync2(`${process.env.HOME}/.openclaw/credentials/lifi-api.json`, "utf-8")
    );
    return cred.api_key ?? "";
  } catch {
    return "";
  }
}
var API_KEY = loadApiKey();
function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) {
    headers["x-lifi-api-key"] = API_KEY;
  }
  return headers;
}
function toQueryString(params) {
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val === void 0 || val === null) continue;
    if (Array.isArray(val)) {
      val.forEach((v) => qs.append(key, String(v)));
    } else {
      qs.set(key, String(val));
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : "";
}
async function get(path, params = {}) {
  const url = `${BASE_URL}${path}${toQueryString(params)}`;
  const res = await fetch(url, { headers: buildHeaders(), signal: AbortSignal.timeout(2e4) });
  if (!res.ok) {
    const body = await res.text();
    throw new LiFiApiError(res.status, `GET ${path} failed: ${body}`);
  }
  return res.json();
}
async function post(path, body) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(2e4)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new LiFiApiError(res.status, `POST ${path} failed: ${text}`);
  }
  return res.json();
}
var LiFiApiError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "LiFiApiError";
  }
};
var lifi = {
  /**
   * get-connections — discover which token pairs can be bridged between chains.
   * Use before get-routes to verify a route exists.
   */
  async getConnections(params = {}) {
    const query = {
      fromChain: params.fromChain,
      toChain: params.toChain,
      fromToken: params.fromToken,
      toToken: params.toToken,
      chainTypes: params.chainTypes
    };
    if (params.allowBridges?.length) {
      query["allowBridges"] = params.allowBridges;
    }
    return get("/connections", query);
  },
  /**
   * get-tokens — list all tokens supported on specified chains.
   * Pass chains as comma-separated IDs: "8453,42161,10,137,1"
   */
  async getTokens(params = {}) {
    return get("/tokens", {
      chains: params.chains,
      chainTypes: params.chainTypes,
      minPriceUSD: params.minPriceUSD
    });
  },
  /**
   * get-routes — find multiple route options for a swap/bridge.
   * Returns routes ranked by the specified order preference.
   */
  async getRoutes(params) {
    const body = {
      fromChainId: params.fromChainId,
      toChainId: params.toChainId,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      fromAmount: params.fromAmount
    };
    if (params.fromAddress) body["fromAddress"] = params.fromAddress;
    if (params.toAddress) body["toAddress"] = params.toAddress;
    if (params.options) body["options"] = params.options;
    return post("/advanced/routes", body);
  },
  /**
   * get-quote — get the single best route + unsigned transactionRequest.
   * IMPORTANT: returned transactionRequest must be signed externally (src/wallet/signer.ts).
   */
  async getQuote(params) {
    const query = {
      fromChain: params.fromChain,
      toChain: params.toChain,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress
    };
    if (params.toAddress) query["toAddress"] = params.toAddress;
    if (params.slippage !== void 0) query["slippage"] = params.slippage;
    if (params.allowBridges?.length) query["allowBridges"] = params.allowBridges.join(",");
    if (params.allowExchanges?.length) query["allowExchanges"] = params.allowExchanges.join(",");
    if (params.order) query["order"] = params.order;
    return get("/quote", query);
  },
  /**
   * get-status — poll the status of an in-progress or completed bridge transfer.
   * Poll until status === 'DONE' | 'FAILED'.
   */
  async getStatus(params) {
    return get("/status", {
      txHash: params.txHash,
      bridge: params.bridge,
      fromChain: params.fromChain,
      toChain: params.toChain
    });
  }
};

// src/intel/lifi-scanner.ts
var TARGET_CHAIN_IDS = Object.values(TARGET_CHAINS);
var SAMPLE_AMOUNT_USDC = "10000000";
async function scanConnectivity() {
  const results = await Promise.allSettled(
    TARGET_CHAIN_IDS.map(async (fromChainId) => {
      const fromToken = USDC_ADDRESSES[fromChainId];
      const reachableChains = [];
      const connectionChecks = await Promise.allSettled(
        TARGET_CHAIN_IDS.filter((id) => id !== fromChainId).map(async (toChainId) => {
          const toToken = USDC_ADDRESSES[toChainId];
          const res = await lifi.getConnections({
            fromChain: fromChainId,
            toChain: toChainId,
            fromToken,
            toToken,
            chainTypes: "EVM"
          });
          if (res.connections.length > 0) {
            return toChainId;
          }
          return null;
        })
      );
      for (const check of connectionChecks) {
        if (check.status === "fulfilled" && check.value !== null) {
          reachableChains.push(check.value);
        }
      }
      return {
        chainId: fromChainId,
        outboundConnections: reachableChains.length,
        reachableChains
      };
    })
  );
  return results.map((res, i) => {
    const chainId = TARGET_CHAIN_IDS[i];
    if (res.status === "fulfilled") return res.value;
    console.warn(`[lifi-scanner] Connectivity scan failed for chain ${chainId}:`, res.reason);
    return { chainId, outboundConnections: 0, reachableChains: [] };
  });
}
async function scanTokenPrices() {
  const chainIds = Object.values(TARGET_CHAINS).join(",");
  let tokenMap = {};
  try {
    const res = await lifi.getTokens({ chains: chainIds, chainTypes: "EVM" });
    tokenMap = res.tokens;
  } catch (err) {
    console.warn("[lifi-scanner] Token price fetch failed:", err);
  }
  return TARGET_CHAIN_IDS.map((chainId) => {
    const chainTokens = tokenMap[String(chainId)] ?? [];
    const usdcAddress = USDC_ADDRESSES[chainId].toLowerCase();
    const usdcToken = chainTokens.find(
      (t) => t.address.toLowerCase() === usdcAddress
    );
    const usdcPriceUsd = usdcToken?.priceUSD ? parseFloat(usdcToken.priceUSD) : 1;
    return { chainId, usdcPriceUsd };
  });
}
async function scanRouteCosts() {
  const pairs = TARGET_CHAIN_IDS.map(
    (id, idx) => [id, TARGET_CHAIN_IDS[(idx + 1) % TARGET_CHAIN_IDS.length]]
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
          order: GUARDRAILS.ROUTE_ORDER
        }
      });
      if (!res.routes.length) {
        return {
          chainId: fromChainId,
          toChainId,
          totalCostUsd: Infinity,
          toAmountUsd: 0,
          tool: "none"
        };
      }
      const best = res.routes[0];
      const gasCostUsd = parseFloat(best.gasCostUSD ?? "0");
      const feeCostUsd = best.steps.reduce((acc, step) => {
        const stepFees = step.estimate.feeCosts.reduce(
          (sum, fee) => sum + parseFloat(fee.amountUSD ?? "0"),
          0
        );
        return acc + stepFees;
      }, 0);
      return {
        chainId: fromChainId,
        toChainId,
        totalCostUsd: gasCostUsd + feeCostUsd,
        toAmountUsd: parseFloat(best.toAmountUSD ?? "0"),
        tool: best.steps[0]?.tool ?? "unknown"
      };
    })
  );
  return results.map((res, i) => {
    const [fromChainId, toChainId] = pairs[i];
    if (res.status === "fulfilled") return res.value;
    console.warn(
      `[lifi-scanner] Route cost scan failed for chain ${fromChainId} \u2192 ${toChainId}:`,
      res.reason
    );
    return {
      chainId: fromChainId,
      toChainId,
      totalCostUsd: Infinity,
      toAmountUsd: 0,
      tool: "error"
    };
  });
}
async function scanLiFi() {
  const [connectivity, tokenPrices, routeCosts] = await Promise.all([
    scanConnectivity(),
    scanTokenPrices(),
    scanRouteCosts()
  ]);
  return {
    connectivity,
    tokenPrices,
    routeCosts,
    scannedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// src/intel/yield.ts
import { ethers } from "ethers";
var ETHENA_YIELD_URL = "https://ethena.fi/api/yields/protocol-and-staking-yield";
var ETHENA_MAX_APY = 50;
async function fetchEthenaApy() {
  const res = await fetch(ETHENA_YIELD_URL, { signal: AbortSignal.timeout(1e4) });
  if (!res.ok) throw new Error(`Ethena API responded ${res.status}`);
  const data = await res.json();
  const raw = data?.stakingYield?.value;
  if (typeof raw !== "number" || !isFinite(raw)) {
    throw new Error("Ethena: stakingYield.value missing or non-numeric");
  }
  if (raw < 0) {
    throw new Error(`Ethena: APY ${raw}% is negative \u2014 rejecting anomalous value`);
  }
  return Math.min(raw, ETHENA_MAX_APY);
}
var AAVE_POOL_ABI = [
  "function getReserveData(address asset) view returns (tuple(tuple(uint256 data) configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))"
];
function rayToApy(liquidityRate) {
  const RAY = 1e27;
  const rate = Number(liquidityRate) / RAY;
  const apy = (Math.exp(rate) - 1) * 100;
  return apy;
}
async function fetchAaveApy(chainId) {
  const config = YIELD_TOKENS[chainId];
  if (!config.aave) throw new Error(`No Aave config for chain ${chainId}`);
  const provider = new ethers.JsonRpcProvider(RPC_URLS[chainId], chainId, { staticNetwork: true });
  const pool = new ethers.Contract(config.aave.poolAddress, AAVE_POOL_ABI, provider);
  const usdcAddress = USDC_ADDRESSES[chainId];
  const call = pool["getReserveData"](usdcAddress);
  const timeout = new Promise(
    (_, reject) => setTimeout(() => reject(new Error(`Aave RPC timeout chain ${chainId}`)), 1e4)
  );
  const reserveData = await Promise.race([call, timeout]);
  return rayToApy(reserveData.currentLiquidityRate);
}
async function fetchChainYield(chainId, ethenaApyResult) {
  const tokens = YIELD_TOKENS[chainId];
  if (tokens.ethena && ethenaApyResult.status === "fulfilled") {
    return {
      chainId,
      protocol: "ethena",
      apy: ethenaApyResult.value,
      tokenAddress: tokens.ethena.sUSDe
    };
  }
  if (tokens.aave) {
    try {
      const apy = await fetchAaveApy(chainId);
      return {
        chainId,
        protocol: "aave",
        apy,
        tokenAddress: tokens.aave.aUSDC
      };
    } catch (err) {
      console.warn(`[yield] Aave APY fetch failed for chain ${chainId}:`, err);
    }
    return {
      chainId,
      protocol: "aave",
      apy: 0,
      tokenAddress: tokens.aave.aUSDC
    };
  }
  const sUsdeAddress = tokens.ethena?.sUSDe ?? USDC_ADDRESSES[chainId];
  return {
    chainId,
    protocol: "ethena",
    apy: 0,
    tokenAddress: sUsdeAddress
  };
}
async function fetchAllYields() {
  const ethenaResult = await Promise.allSettled([fetchEthenaApy()]);
  const ethenaApyResult = ethenaResult[0];
  if (ethenaApyResult.status === "rejected") {
    console.warn("[yield] Ethena APY fetch failed:", ethenaApyResult.reason);
  }
  const chainIds = Object.values(TARGET_CHAINS);
  const results = await Promise.allSettled(
    chainIds.map((chainId) => fetchChainYield(chainId, ethenaApyResult))
  );
  return results.map((res, i) => {
    const chainId = chainIds[i];
    if (res.status === "fulfilled") return res.value;
    console.warn(`[yield] Yield fetch failed for chain ${chainId}:`, res.reason);
    const tokens = YIELD_TOKENS[chainId];
    return {
      chainId,
      protocol: "aave",
      apy: 0,
      tokenAddress: tokens.aave?.aUSDC ?? USDC_ADDRESSES[chainId]
    };
  });
}
function getBestYieldToken(chainId) {
  const tokens = YIELD_TOKENS[chainId];
  if (tokens.ethena) {
    return { address: tokens.ethena.sUSDe, protocol: "ethena" };
  }
  if (tokens.aave) {
    return { address: tokens.aave.aUSDC, protocol: "aave" };
  }
  return { address: USDC_ADDRESSES[chainId], protocol: "aave" };
}
async function getYields() {
  const ethenaApySettled = await Promise.allSettled([fetchEthenaApy()]);
  const ethenaResult = ethenaApySettled[0];
  if (ethenaResult.status === "rejected") {
    console.warn("[yield] Ethena APY fetch failed:", ethenaResult.reason);
  }
  const ethenaApy = ethenaResult.status === "fulfilled" ? ethenaResult.value : 0;
  const chainIds = Object.values(TARGET_CHAINS);
  const entries = [];
  await Promise.allSettled(
    chainIds.flatMap((chainId) => {
      const tasks = [];
      const ethenaConfig = YIELD_PROTOCOLS["ethena"]?.[chainId];
      if (ethenaConfig) {
        entries.push({
          chainId,
          protocol: "ethena",
          apy: ethenaApy,
          depositToken: ethenaConfig.depositToken,
          vaultAddress: ethenaConfig.vaultAddress
        });
      }
      const aaveConfig = YIELD_PROTOCOLS["aave"]?.[chainId];
      if (aaveConfig) {
        const aaveTokens = YIELD_TOKENS[chainId];
        if (aaveTokens.aave) {
          tasks.push(
            fetchAaveApy(chainId).then((apy) => {
              entries.push({
                chainId,
                protocol: "aave",
                apy,
                depositToken: aaveConfig.depositToken,
                vaultAddress: aaveConfig.vaultAddress
              });
            }).catch((err) => {
              console.warn(`[yield] Aave APY fetch failed for chain ${chainId}:`, err);
              entries.push({
                chainId,
                protocol: "aave",
                apy: 0,
                depositToken: aaveConfig.depositToken,
                vaultAddress: aaveConfig.vaultAddress
              });
            })
          );
        }
      }
      return tasks;
    })
  );
  entries.sort((a, b) => b.apy - a.apy);
  return entries;
}

// src/intel/signal.ts
function tvlChangeToScore(changePct) {
  const { TVL_CHANGE_POSITIVE_PCT, TVL_CHANGE_NEGATIVE_PCT } = SIGNAL_THRESHOLDS;
  if (changePct >= TVL_CHANGE_POSITIVE_PCT) return 1;
  if (changePct <= TVL_CHANGE_NEGATIVE_PCT) return 0;
  const range = TVL_CHANGE_POSITIVE_PCT - TVL_CHANGE_NEGATIVE_PCT;
  return (changePct - TVL_CHANGE_NEGATIVE_PCT) / range;
}
function volumeToScore(volume, maxVolume) {
  if (maxVolume <= 0) return 0.5;
  return Math.min(volume / maxVolume, 1);
}
function bridgeCostToScore(costUsd) {
  if (!isFinite(costUsd) || costUsd < 0) return 0;
  const REF_COST = 2;
  return Math.exp(-costUsd / REF_COST);
}
function yieldApyToScore(apy) {
  if (!isFinite(apy) || apy < 0) return 0;
  const REF_APY = 10;
  return Math.min(apy / REF_APY, 1);
}
function findTvl(tvl, chainId) {
  return tvl.find((d) => d.chainId === chainId) ?? {
    chainId,
    chainName: String(chainId),
    tvlUsd: 0,
    tvlChange24hPct: 0
  };
}
function findDex(dex, chainId) {
  return dex.find((d) => d.chainId === chainId) ?? {
    chainId,
    chainName: String(chainId),
    dexVolume24hUsd: 0
  };
}
function findPrice(prices, chainId) {
  return prices.find((p) => p.chainId === chainId) ?? { chainId, usdcPriceUsd: 1 };
}
function findConnectivity(connectivity, chainId) {
  return connectivity.find((c) => c.chainId === chainId) ?? {
    chainId,
    outboundConnections: 0,
    reachableChains: []
  };
}
function findRouteCost(costs, chainId) {
  const cost = costs.find((r) => r.chainId === chainId);
  return cost ? cost.totalCostUsd : Infinity;
}
function findYield(yields, chainId) {
  return yields.find((y) => y.chainId === chainId) ?? {
    chainId,
    protocol: "aave",
    apy: 0,
    tokenAddress: ""
  };
}
var CHAIN_NAMES = {
  [TARGET_CHAINS.ETHEREUM]: "Ethereum",
  [TARGET_CHAINS.OPTIMISM]: "Optimism",
  [TARGET_CHAINS.POLYGON]: "Polygon",
  [TARGET_CHAINS.ARBITRUM]: "Arbitrum",
  [TARGET_CHAINS.BASE]: "Base"
};
var WEIGHTS = {
  tvl: 0.35,
  volume: 0.25,
  access: 0.2,
  yield: 0.2
};
function aggregateSignals(tvlData, dexData, connectivity, tokenPrices, routeCosts, yieldData, allYieldEntries = []) {
  const chainIds = Object.values(TARGET_CHAINS);
  const maxVolume = Math.max(...dexData.map((d) => d.dexVolume24hUsd), 0);
  const chains = chainIds.map((chainId) => {
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
    const score = WEIGHTS.tvl * tvlScore + WEIGHTS.volume * volumeScore + WEIGHTS.access * accessScore + WEIGHTS.yield * yieldScore;
    const usdcDeviation = Math.abs(price.usdcPriceUsd - 1);
    const finalScore = usdcDeviation > 0.01 ? score * 0.8 : score;
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
        bridgeCostUsd: isFinite(bridgeCostUsd) ? bridgeCostUsd : -1
      },
      yieldApy: yld.apy,
      yieldProtocol: yld.protocol,
      yieldOptions: chainYieldOptions,
      isCandidate: finalScore >= SIGNAL_THRESHOLDS.MIN_CONFIDENCE
    };
  });
  chains.sort((a, b) => b.score - a.score);
  const hasTvl = tvlData.some((d) => d.tvlUsd > 0);
  const hasVolume = dexData.some((d) => d.dexVolume24hUsd > 0);
  return {
    chains,
    topChain: chains[0].chainId,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    dataQualityOk: hasTvl && hasVolume,
    yieldOptions: allYieldEntries
  };
}
async function generateSignalReport() {
  const [{ tvl, dex }, lifiScan, yieldData, allYieldEntries] = await Promise.all([
    fetchDefiLlamaIntel(),
    scanLiFi(),
    fetchAllYields(),
    getYields()
  ]);
  return aggregateSignals(
    tvl,
    dex,
    lifiScan.connectivity,
    lifiScan.tokenPrices,
    lifiScan.routeCosts,
    yieldData,
    allYieldEntries
  );
}

// src/main/allocator.ts
function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
function stdDev(values) {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
function mergeSignals(reports) {
  const byChain = /* @__PURE__ */ new Map();
  for (const report of reports) {
    for (const signal of report.chains) {
      const existing = byChain.get(signal.chainId) ?? [];
      existing.push(signal);
      byChain.set(signal.chainId, existing);
    }
  }
  const merged = /* @__PURE__ */ new Map();
  for (const [chainId, signals] of byChain) {
    const scores = signals.map((s) => s.score);
    const avgScore = mean(scores);
    const dev = stdDev(scores);
    const base = signals[signals.length - 1];
    merged.set(chainId, {
      ...base,
      score: avgScore,
      isCandidate: avgScore >= SIGNAL_THRESHOLDS.MIN_CONFIDENCE,
      scoreStdDev: dev
    });
  }
  return merged;
}
function applyRiskAdjustment(signal, maxTvlUsd) {
  const variancePenalty = Math.exp(-2 * signal.scoreStdDev);
  let tvlBonus = 0;
  if (maxTvlUsd > 0 && signal.raw.tvlUsd > 0) {
    const normLog = Math.log1p(signal.raw.tvlUsd) / Math.log1p(maxTvlUsd);
    tvlBonus = 0.1 * normLog;
  }
  const adjusted = (signal.score + tvlBonus) * variancePenalty;
  return Math.min(Math.max(adjusted, 0), 1);
}
function capAndRenormalise(weights, cap) {
  const result = new Map(weights);
  for (let pass = 0; pass < 10; pass++) {
    const total2 = [...result.values()].reduce((a, b) => a + b, 0);
    if (total2 === 0) break;
    for (const [id, w] of result) result.set(id, w / total2);
    const capped = [...result.entries()].filter(([, w]) => w > cap);
    if (capped.length === 0) break;
    let overflow = 0;
    for (const [id, w] of capped) {
      overflow += w - cap;
      result.set(id, cap);
    }
    const uncapped = [...result.entries()].filter(([, w]) => w < cap);
    const uncappedTotal = uncapped.reduce((a, [, w]) => a + w, 0);
    if (uncappedTotal === 0) break;
    for (const [id, w] of uncapped) {
      result.set(id, w + overflow * (w / uncappedTotal));
    }
  }
  const total = [...result.values()].reduce((a, b) => a + b, 0);
  if (total > 0) for (const [id, w] of result) result.set(id, w / total);
  return result;
}
function generateMoves(allocations) {
  const sources = allocations.filter((a) => a.deltaUsd < -0.01).sort((a, b) => a.deltaUsd - b.deltaUsd);
  const sinks = allocations.filter((a) => a.deltaUsd > 0.01).sort((a, b) => b.deltaUsd - a.deltaUsd);
  const moves = [];
  const remaining = new Map(
    sources.map((s) => [s.chainId, Math.abs(s.deltaUsd)])
  );
  const needed = new Map(
    sinks.map((s) => [s.chainId, s.deltaUsd])
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
        rationale: `Move $${transferable.toFixed(2)} from ${source.chainName} (over-allocated by $${Math.abs(source.deltaUsd).toFixed(2)}) to ${sink.chainName} (under-allocated by $${sink.deltaUsd.toFixed(2)}, score ${sink.adjustedScore.toFixed(3)})`
      });
      remaining.set(source.chainId, available - transferable);
      stillNeeded -= transferable;
    }
  }
  return moves;
}
function computeAllocation(reports, portfolio) {
  if (reports.length === 0) throw new Error("allocator: at least one SignalReport required");
  const dataQualityOk = reports.every((r) => r.dataQualityOk);
  const merged = mergeSignals(reports);
  const chainIds = Object.values(TARGET_CHAINS);
  const totalPortfolioUsd = chainIds.reduce((sum, id) => sum + (portfolio[id] ?? 0), 0);
  const maxTvlUsd = Math.max(
    ...[...merged.values()].map((s) => s.raw.tvlUsd),
    0
  );
  const candidates = [...merged.entries()].filter(([, s]) => s.isCandidate).map(([id, s]) => ({ id, signal: s, adjustedScore: applyRiskAdjustment(s, maxTvlUsd) })).filter((c) => c.adjustedScore > 0);
  let finalWeights;
  if (candidates.length === 0) {
    finalWeights = new Map(
      chainIds.map((id) => [
        id,
        totalPortfolioUsd > 0 ? (portfolio[id] ?? 0) / totalPortfolioUsd : 0
      ])
    );
  } else {
    const bestByProtocol = /* @__PURE__ */ new Map();
    const dedupedCandidates = [];
    for (const c of candidates) {
      const signal = merged.get(c.id);
      const protocol = signal?.yieldProtocol ?? "none";
      const existing = bestByProtocol.get(protocol);
      const bridgeCost = signal?.raw.bridgeCostUsd ?? Infinity;
      const existingCost = existing?.cost ?? Infinity;
      if (!existing || bridgeCost < existingCost || bridgeCost === existingCost && c.adjustedScore > existing.score) {
        bestByProtocol.set(protocol, { id: c.id, score: c.adjustedScore, cost: bridgeCost });
      }
    }
    const protocolBestChains = new Set([...bestByProtocol.values()].map((v) => v.id));
    for (const c of candidates) {
      const signal = merged.get(c.id);
      const protocol = signal?.yieldProtocol ?? "none";
      const best = bestByProtocol.get(protocol);
      if (best && best.id === c.id) {
        dedupedCandidates.push(c);
      } else if (signal?.yieldProtocol && signal.yieldProtocol !== "none") {
        console.log(
          `[allocator] Dedup: skipping ${signal.chainName} for ${protocol} (${c.adjustedScore.toFixed(3)} < best ${best?.score.toFixed(3)} on chain ${best?.id})`
        );
      } else {
        dedupedCandidates.push(c);
      }
    }
    const rawWeights = new Map(chainIds.map((id) => [id, 0]));
    for (const { id, adjustedScore } of dedupedCandidates) {
      rawWeights.set(id, adjustedScore);
    }
    finalWeights = capAndRenormalise(rawWeights, GUARDRAILS.MAX_CHAIN_ALLOCATION);
  }
  const allocations = chainIds.map((id) => {
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
      deltaUsd: Math.round((targetUsd - currentUsd) * 100) / 100
    };
  });
  const moves = totalPortfolioUsd > 0 && candidates.length > 0 ? generateMoves(allocations) : [];
  const topAllocs = allocations.filter((a) => a.targetWeight > 0).sort((a, b) => b.targetWeight - a.targetWeight).slice(0, 3).map((a) => `${a.chainName} ${(a.targetWeight * 100).toFixed(0)}%`).join(", ");
  const summary = candidates.length === 0 ? "No chains meet confidence threshold \u2014 holding current positions." : `Target: ${topAllocs}. ${moves.length} move(s) queued across $${totalPortfolioUsd.toFixed(2)} portfolio.`;
  return {
    allocations,
    moves,
    totalPortfolioUsd,
    dataQualityOk,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    summary
  };
}

// src/wallet/signer.ts
import { ethers as ethers2 } from "ethers";
import { readFile } from "fs/promises";
var RPC_BY_CHAIN_ID = {
  1: "https://eth.llamarpc.com",
  10: "https://mainnet.optimism.io",
  137: "https://polygon-bor-rpc.publicnode.com",
  42161: "https://arb1.arbitrum.io/rpc",
  8453: "https://mainnet.base.org",
  84532: "https://sepolia.base.org"
};
var LIFI_KNOWN_ROUTERS = /* @__PURE__ */ new Set([
  "0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae",
  // LI.FI Diamond (Ethereum, Optimism, Polygon, Arbitrum, Base + others)
  "0x341e94069f53234fe6dabef707ad424830525715"
  // LI.FI Diamond v2 (some chains)
]);
function assertKnownLifiRouter(address, role) {
  if (!LIFI_KNOWN_ROUTERS.has(address.toLowerCase())) {
    throw new Error(
      `[signer] SECURITY: ${role} address ${address} is not a known LI.FI router. Refusing to sign. If this is a new LI.FI contract, add it to LIFI_KNOWN_ROUTERS after verifying on https://docs.li.fi/smart-contracts/deployed-contracts`
    );
  }
}
async function loadPrivateKey() {
  let raw;
  try {
    raw = await readFile(WALLET.KEY_FILE, "utf-8");
  } catch (err) {
    throw new Error(
      `[signer] Cannot read wallet file at ${WALLET.KEY_FILE}: ${String(err)}`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`[signer] wallet.json is not valid JSON`);
  }
  if (typeof parsed.privateKey !== "string" || !parsed.privateKey.startsWith("0x")) {
    throw new Error(`[signer] wallet.json missing a valid hex privateKey field`);
  }
  return parsed.privateKey;
}
function getProvider(chainId) {
  const rpc = RPC_BY_CHAIN_ID[chainId];
  if (!rpc) {
    throw new Error(`[signer] No RPC URL configured for chainId ${chainId}`);
  }
  return new ethers2.JsonRpcProvider(rpc, chainId, { staticNetwork: true });
}
async function ensureApproval(wallet, tokenAddress, spender, amount) {
  const erc20 = new ethers2.Contract(tokenAddress, [
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
  ], wallet);
  assertKnownLifiRouter(spender, "approvalAddress/spender");
  const current = await erc20.allowance(wallet.address, spender);
  if (current >= amount) {
    console.log(`[signer] Allowance OK (${current} >= ${amount})`);
    return;
  }
  console.log(`[signer] Approving ${tokenAddress} for spender ${spender} (amount: ${amount})...`);
  const approveTx = await erc20.approve(spender, amount);
  console.log(`[signer] Approve tx: ${approveTx.hash}`);
  await approveTx.wait(1);
  console.log(`[signer] Approve confirmed`);
}
async function signAndBroadcast(txReq) {
  const privateKey = await loadPrivateKey();
  const provider = getProvider(txReq.chainId);
  const wallet = new ethers2.Wallet(privateKey, provider);
  if (wallet.address.toLowerCase() !== WALLET.ADDRESS.toLowerCase()) {
    throw new Error(
      `[signer] Address mismatch: wallet has ${wallet.address}, config expects ${WALLET.ADDRESS}`
    );
  }
  if (txReq.approvalAddress && txReq.fromToken && txReq.fromAmount) {
    await ensureApproval(
      wallet,
      txReq.fromToken,
      txReq.approvalAddress,
      BigInt(txReq.fromAmount)
    );
  }
  if (!txReq.to) {
    throw new Error("[signer] SECURITY: txReq.to is missing \u2014 refusing to sign");
  }
  assertKnownLifiRouter(txReq.to, "txReq.to");
  const tx = {
    to: txReq.to,
    data: txReq.data,
    value: txReq.value ? BigInt(txReq.value) : 0n,
    chainId: txReq.chainId
  };
  if (txReq.gasPrice) tx.gasPrice = BigInt(txReq.gasPrice);
  if (txReq.gasLimit) tx.gasLimit = BigInt(txReq.gasLimit);
  const sent = await wallet.sendTransaction(tx);
  console.log(`[signer] Submitted tx ${sent.hash} on chain ${txReq.chainId}`);
  return { txHash: sent.hash, chainId: txReq.chainId };
}
async function getUsdcBalance(chainId, usdcAddress, decimals = 6) {
  const provider = getProvider(chainId);
  const abi = ["function balanceOf(address owner) view returns (uint256)"];
  const contract = new ethers2.Contract(usdcAddress, abi, provider);
  const raw = await contract.balanceOf(WALLET.ADDRESS);
  return Number(raw) / 10 ** decimals;
}
async function fetchAllUsdcBalances() {
  const entries = Object.entries(USDC_ADDRESSES);
  const balances = {};
  const results = await Promise.allSettled(
    entries.map(async ([chainIdStr, addr]) => {
      const chainId = Number(chainIdStr);
      const bal = await getUsdcBalance(chainId, addr);
      return { chainId, bal };
    })
  );
  for (const res of results) {
    if (res.status === "fulfilled") {
      balances[res.value.chainId] = res.value.bal;
    } else {
      console.warn("[signer] Balance fetch failed:", res.reason);
    }
  }
  return balances;
}

// src/wallet/tracker.ts
import { ethers as ethers3 } from "ethers";
var POLL_INTERVAL_MS = 1e4;
var MAX_WAIT_MS = 20 * 6e4;
var LIFI_CODE_NOT_EVM = 1011;
var MAYAN_FALLBACK_WAIT_MS = 6e4;
var MAYAN_AMOUNT_TOLERANCE = 985n;
var TERMINAL = /* @__PURE__ */ new Set(["DONE", "FAILED"]);
var ERC20_BALANCE_ABI = ["function balanceOf(address) view returns (uint256)"];
function extractLifiErrorCode(err) {
  if (typeof err !== "object" || err === null) return void 0;
  const e = err;
  if (typeof e["code"] === "number") return e["code"];
  if (typeof e["response"] === "object" && e["response"] !== null) {
    const data = e["response"]["data"];
    if (typeof data === "object" && data !== null) {
      const code = data["code"];
      if (typeof code === "number") return code;
    }
  }
  if (typeof e["cause"] === "object" && e["cause"] !== null) {
    const cause = e["cause"];
    if (typeof cause["code"] === "number") return cause["code"];
  }
  if (typeof e["data"] === "object" && e["data"] !== null) {
    const data = e["data"];
    if (typeof data["code"] === "number") return data["code"];
  }
  console.warn(
    "[tracker] extractLifiErrorCode: no numeric .code found in error. Full error object (may indicate SDK version change):",
    JSON.stringify(err, Object.getOwnPropertyNames(err))
  );
  return void 0;
}
async function trackTransaction(txHash, bridge, fromChain, toChain, toToken, toAddress, expectedToAmount) {
  const start = Date.now();
  const pendingFallback = {
    status: "PENDING",
    sending: {},
    receiving: {}
  };
  let lastStatus = pendingFallback;
  let mayanFallbackTriggered = false;
  console.log(
    `[tracker] Watching tx ${txHash}` + (bridge ? ` via ${bridge}` : "") + (fromChain && toChain ? ` (${fromChain} \u2192 ${toChain})` : "")
  );
  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed > MAX_WAIT_MS) {
      console.warn(
        `[tracker] Timeout after ${Math.round(elapsed / 1e3)}s \u2014 tx ${txHash} still ${lastStatus.status}`
      );
      return { txHash, finalStatus: lastStatus, elapsedMs: elapsed, timedOut: true };
    }
    try {
      const status = await lifi.getStatus({ txHash, bridge, fromChain, toChain });
      lastStatus = status;
      console.log(
        `[tracker] ${txHash} \u2014 ${status.status}` + (status.subStatus ? ` (${status.subStatus})` : "") + ` [${Math.round(elapsed / 1e3)}s]`
      );
      if (TERMINAL.has(status.status)) {
        return { txHash, finalStatus: status, elapsedMs: Date.now() - start, timedOut: false };
      }
    } catch (err) {
      const errCode = extractLifiErrorCode(err);
      if (errCode === LIFI_CODE_NOT_EVM && !mayanFallbackTriggered) {
        console.warn(
          `[tracker] LI.FI returned 1011 (Not an EVM Transaction) for ${txHash} \u2014 Mayan/Solana route detected. Falling back to destination balance polling.`
        );
        if (toChain && toToken && toAddress) {
          if (!expectedToAmount) {
            console.warn(
              "[tracker] expectedToAmount not provided \u2014 amount threshold validation disabled. Any balance increase on toAddress will be treated as the bridged funds. Pass expectedToAmount to prevent false-DONE from concurrent deposits."
            );
          }
          const fallback = await mayanBalanceFallback(
            toChain,
            toToken,
            toAddress,
            txHash,
            expectedToAmount
          );
          if (fallback.outcome === "rpc_failure") {
            console.warn(
              "[tracker] Mayan fallback aborted due to RPC failure \u2014 will retry on next 1011 error."
            );
          } else {
            mayanFallbackTriggered = true;
            if (fallback.outcome === "done") {
              return {
                txHash,
                finalStatus: fallback.status,
                elapsedMs: Date.now() - start,
                timedOut: false
              };
            }
          }
        } else {
          mayanFallbackTriggered = true;
          console.warn(
            `[tracker] Cannot do balance fallback: toChain/toToken/toAddress not provided. Will continue polling (tx will likely time out).`
          );
        }
      } else if (errCode !== LIFI_CODE_NOT_EVM) {
        console.warn(`[tracker] Poll error for ${txHash}:`, err);
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
}
async function mayanBalanceFallback(toChain, toToken, toAddress, txHash, expectedAmount) {
  const rpcUrl = RPC_URLS[toChain];
  if (!rpcUrl) {
    console.warn(`[tracker] No RPC URL for chain ${toChain} \u2014 cannot do Mayan balance fallback`);
    return { outcome: "rpc_failure" };
  }
  const provider = new ethers3.JsonRpcProvider(rpcUrl, toChain, { staticNetwork: true });
  const token = new ethers3.Contract(toToken, ERC20_BALANCE_ABI, provider);
  let initialBalance;
  try {
    initialBalance = await token["balanceOf"](toAddress);
  } catch (err) {
    console.warn(`[tracker] Could not read initial balance for Mayan fallback:`, err);
    return { outcome: "rpc_failure" };
  }
  console.log(
    `[tracker] Mayan fallback: initial balance on chain ${toChain} = ${initialBalance}. Waiting ${MAYAN_FALLBACK_WAIT_MS / 1e3}s\u2026`
  );
  await sleep(MAYAN_FALLBACK_WAIT_MS);
  let newBalance;
  try {
    newBalance = await token["balanceOf"](toAddress);
  } catch (err) {
    console.warn(`[tracker] Could not read final balance for Mayan fallback:`, err);
    return { outcome: "no_increase" };
  }
  if (newBalance <= initialBalance) {
    console.warn(
      `[tracker] Mayan fallback: balance did NOT increase after ${MAYAN_FALLBACK_WAIT_MS / 1e3}s (${initialBalance} \u2192 ${newBalance}). Will continue polling.`
    );
    return { outcome: "no_increase" };
  }
  const delta = newBalance - initialBalance;
  if (expectedAmount) {
    const expected = BigInt(expectedAmount);
    const minRequired = expected * MAYAN_AMOUNT_TOLERANCE / 1000n;
    if (delta < minRequired) {
      console.warn(
        `[tracker] Mayan fallback: balance increased by ${delta} but expected \u2265 ${minRequired} (${expected} \xD7 ${Number(MAYAN_AMOUNT_TOLERANCE) / 10}%). Likely an unrelated deposit \u2014 rejecting to avoid false DONE.`
      );
      return { outcome: "no_increase" };
    }
  }
  const received = delta.toString();
  console.log(
    `[tracker] Mayan fallback DONE: ${txHash} \u2014 balance increased by ${received} on chain ${toChain}`
  );
  return {
    outcome: "done",
    status: {
      status: "DONE",
      sending: { txHash },
      receiving: {
        amount: received,
        chainId: toChain,
        address: toAddress,
        // txHash intentionally absent — Mayan/Solana route; no EVM dest tx to record
        timestamp: Math.floor(Date.now() / 1e3)
      },
      subStatus: "MAYAN_BALANCE_CONFIRMED"
    }
  };
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/sentinel/monitor.ts
import { ethers as ethers4 } from "ethers";
import { readFileSync as readFileSync3, writeFileSync, existsSync } from "fs";
import { randomBytes } from "crypto";
var STATE_FILE = "/tmp/chainpilot-monitor-state.json";
var _cancelNonce = randomBytes(8).toString("hex");
var CANCEL_FILE = `/tmp/chainpilot-cancel-evacuate-${_cancelNonce}`;
var TVL_DROP_THRESHOLD = 0.1;
var DEPEG_THRESHOLD_USD = 980;
var RPC_TIMEOUT_MS = 1e4;
var RpcTimeoutError = class extends Error {
  constructor(msg) {
    super(msg);
    this.name = "RpcTimeoutError";
  }
};
function withTimeout(promise, ms, label) {
  let timerId;
  const race = Promise.race([
    promise,
    new Promise((_, reject) => {
      timerId = setTimeout(
        () => reject(new RpcTimeoutError(`RPC timeout (${ms}ms): ${label}`)),
        ms
      );
    })
  ]);
  return race.finally(() => {
    if (timerId !== void 0) clearTimeout(timerId);
  });
}
var ERC4626_ABI = [
  "function totalAssets() view returns (uint256)"
];
var ERC4626_CONVERT_ABI = [
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)"
];
var DEFILLAMA_POOL_IDS = {
  "ethena-1": "66985a81-9c51-46ca-9977-42b4fe7bc6df",
  // sUSDe Ethereum
  "ethena-8453": "66985a81-9c51-46ca-9977-42b4fe7bc6df",
  // sUSDe Base → use Eth pool (protocol-level TVL)
  "ethena-42161": "66985a81-9c51-46ca-9977-42b4fe7bc6df",
  // sUSDe Arb  → use Eth pool
  "aave-1": "aa70268e-4b52-42bf-a116-608b370f9501",
  // Aave v3 USDC Eth
  "aave-8453": "7e0661bf-8cf3-45e6-9424-31916d4c7b84",
  // Aave v3 USDC Base
  "aave-42161": "d9fa8e14-0447-4207-9ae8-7810199dfa1f"
  // Aave v3 USDC Arb
};
var PAUSABLE_ABI = [
  "function paused() view returns (bool)"
];
async function fetchTvlFromDeFiLlama(poolId) {
  try {
    const res = await fetch(`https://yields.llama.fi/chart/${poolId}`, { signal: AbortSignal.timeout(1e4) });
    if (!res.ok) return null;
    const text = await res.text();
    const data = JSON.parse(text);
    const points = data?.data;
    if (!Array.isArray(points) || points.length === 0) return null;
    const latest = points[points.length - 1];
    return typeof latest.tvlUsd === "number" ? latest.tvlUsd : null;
  } catch {
    return null;
  }
}
function loadState() {
  if (!existsSync(STATE_FILE)) return {};
  try {
    const raw = JSON.parse(readFileSync3(STATE_FILE, "utf-8"));
    const state = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "number") {
        state[k] = { value: v, method: "totalAssets" };
      } else if (typeof v === "object" && v !== null && typeof v["value"] === "number") {
        state[k] = v;
      }
    }
    return state;
  } catch {
    return {};
  }
}
function saveState(state) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.warn("[monitor] Failed to save state:", err);
  }
}
async function checkTvlDrop(protocol, chainId, vaultAddress, state) {
  const stateKey = `${protocol}-${chainId}`;
  const provider = new ethers4.JsonRpcProvider(RPC_URLS[chainId], chainId, { staticNetwork: true });
  const vault4626 = new ethers4.Contract(vaultAddress, ERC4626_ABI, provider);
  const vaultConvert = new ethers4.Contract(vaultAddress, ERC4626_CONVERT_ABI, provider);
  let currentAssets;
  let method;
  try {
    currentAssets = await withTimeout(
      vault4626["totalAssets"](),
      RPC_TIMEOUT_MS,
      `${protocol}@${chainId} totalAssets`
    );
    method = "totalAssets";
  } catch (err) {
    if (err instanceof RpcTimeoutError) {
      return `TVL check timed out for ${protocol}@${chainId}: RPC unresponsive (totalAssets)`;
    }
    console.log(
      `[monitor] ${protocol}@${chainId}: totalAssets() reverted \u2014 falling back to convertToAssets(totalSupply())`
    );
    try {
      const supply = await withTimeout(
        vaultConvert["totalSupply"](),
        RPC_TIMEOUT_MS,
        `${protocol}@${chainId} totalSupply`
      );
      currentAssets = await withTimeout(
        vaultConvert["convertToAssets"](supply),
        RPC_TIMEOUT_MS,
        `${protocol}@${chainId} convertToAssets`
      );
      method = "convertToAssets";
    } catch (err2) {
      if (err2 instanceof RpcTimeoutError) {
        return `TVL check timed out for ${protocol}@${chainId}: RPC unresponsive (convertToAssets fallback)`;
      }
      console.log(
        `[monitor] ${protocol}@${chainId}: convertToAssets() also reverted \u2014 trying DeFiLlama API fallback`
      );
      const poolId = DEFILLAMA_POOL_IDS[stateKey];
      if (poolId) {
        const llamaTvl = await fetchTvlFromDeFiLlama(poolId);
        if (llamaTvl !== null && llamaTvl > 0) {
          currentAssets = BigInt(Math.round(llamaTvl));
          method = "defillama";
          console.log(
            `[monitor] ${protocol}@${chainId}: DeFiLlama TVL = $${llamaTvl.toLocaleString()} (protocol-level \u2014 ${protocol} has no per-chain vault on chain ${chainId})`
          );
        } else {
          return `TVL check failed for ${protocol}@${chainId}: on-chain + DeFiLlama both unavailable`;
        }
      } else {
        return `TVL check failed for ${protocol}@${chainId}: neither totalAssets() nor convertToAssets() available, no DeFiLlama pool configured`;
      }
    }
  }
  const currentNum = Number(currentAssets);
  const previous = state[stateKey];
  if (previous !== void 0 && previous.method !== method) {
    console.warn(
      `[monitor] TVL method changed for ${stateKey}: ${previous.method} \u2192 ${method}. Skipping drop comparison this cycle to avoid false alert from unit mismatch. New baseline: ${currentNum} (method: ${method})`
    );
    state[stateKey] = { value: currentNum, method };
    return null;
  }
  state[stateKey] = { value: currentNum, method };
  if (previous !== void 0 && previous.value > 0) {
    const dropPct = (previous.value - currentNum) / previous.value;
    if (dropPct >= TVL_DROP_THRESHOLD) {
      return `TVL DROP: ${protocol}@chain${chainId} dropped ${(dropPct * 100).toFixed(1)}% (${previous.value} \u2192 ${currentNum}) [method: ${method}]`;
    }
  }
  return null;
}
async function checkDepeg(protocol, chainId, yieldToken, decimals) {
  const usdcAddress = USDC_ADDRESSES[chainId];
  if (!usdcAddress) return null;
  const quoteAmount = (1000n * 10n ** BigInt(decimals)).toString();
  try {
    const quote = await lifi.getQuote({
      fromChain: chainId,
      toChain: chainId,
      fromToken: yieldToken,
      toToken: usdcAddress,
      fromAmount: quoteAmount,
      fromAddress: WALLET.ADDRESS
    });
    const toAmountRaw = quote.toAmount;
    if (!toAmountRaw) return null;
    const toAmountUsd = Number(toAmountRaw) / 1e6;
    if (toAmountUsd < DEPEG_THRESHOLD_USD) {
      return `DEPEG: ${protocol}@chain${chainId} quotes ${toAmountUsd.toFixed(2)} USDC for 1000 tokens (threshold ${DEPEG_THRESHOLD_USD})`;
    }
  } catch (err) {
    console.warn(`[monitor] Depeg quote failed for ${protocol}@${chainId}:`, err);
    return `DEPEG CHECK FAILED: ${protocol}@chain${chainId} \u2014 LI.FI quote error: ${String(err)}`;
  }
  return null;
}
async function checkPaused(protocol, chainId, vaultAddress) {
  const provider = new ethers4.JsonRpcProvider(RPC_URLS[chainId], chainId, { staticNetwork: true });
  const vault = new ethers4.Contract(vaultAddress, PAUSABLE_ABI, provider);
  try {
    const isPaused = await withTimeout(
      vault["paused"](),
      RPC_TIMEOUT_MS,
      `${protocol}@${chainId} paused`
    );
    if (isPaused) {
      return `PAUSED: ${protocol}@chain${chainId} vault ${vaultAddress} is paused`;
    }
  } catch (err) {
    if (err instanceof RpcTimeoutError) {
      console.warn(`[monitor] paused() timed out for ${protocol}@${chainId} \u2014 treating as healthy`);
    }
  }
  return null;
}
var _pendingCheck = Promise.resolve();
function checkProtocolHealth(protocol, chainId) {
  const result = _pendingCheck.then(
    () => _doCheck(protocol, chainId),
    () => _doCheck(protocol, chainId)
    // run even if previous call errored
  );
  _pendingCheck = result.catch(() => {
  });
  return result;
}
async function _doCheck(protocol, chainId) {
  const config = YIELD_PROTOCOLS[protocol]?.[chainId];
  if (!config) {
    return {
      healthy: false,
      alerts: [`No config for ${protocol}@chain${chainId}`]
    };
  }
  const yieldToken = config.receiptToken ?? config.depositToken;
  const state = loadState();
  const [tvlAlert, depegAlert, pausedAlert] = await Promise.all([
    checkTvlDrop(protocol, chainId, config.vaultAddress, state),
    checkDepeg(protocol, chainId, yieldToken, config.decimals),
    checkPaused(protocol, chainId, config.vaultAddress)
  ]);
  saveState(state);
  const alerts = [tvlAlert, depegAlert, pausedAlert].filter((a) => a !== null);
  return {
    healthy: alerts.length === 0,
    alerts
  };
}

// src/main/guardrails.ts
function checkTxLimit(move) {
  const rule = "MAX_TX_USD";
  const limit = GUARDRAILS.MAX_TX_USD;
  const actual = move.amountUsd;
  if (actual > limit) {
    return {
      rule,
      status: "FAIL",
      message: `Move $${actual.toFixed(2)} from ${move.fromChainName}\u2192${move.toChainName} exceeds $${limit} limit`,
      actual,
      limit
    };
  }
  return {
    rule,
    status: "PASS",
    message: `$${actual.toFixed(2)} \u2264 $${limit} \u2713`,
    actual,
    limit
  };
}
function checkSlippage(quote) {
  const rule = "MAX_SLIPPAGE";
  const limit = GUARDRAILS.MAX_SLIPPAGE;
  let toAmtBig;
  let toAmtMinBig;
  try {
    toAmtBig = BigInt(quote.estimate.toAmount);
    toAmtMinBig = BigInt(quote.estimate.toAmountMin);
  } catch {
    return {
      rule,
      status: "FAIL",
      message: "Quote amounts are non-integer or missing \u2014 rejecting for safety",
      actual: "invalid",
      limit
    };
  }
  if (toAmtBig <= 0n) {
    return {
      rule,
      status: "FAIL",
      message: "Quote toAmount is zero \u2014 rejecting for safety",
      actual: "zero",
      limit
    };
  }
  const MAX_SLIPPAGE_BPS = BigInt(Math.round(limit * 1e4));
  const slippageBps = (toAmtBig - toAmtMinBig) * 10000n / toAmtBig;
  const effectiveSlippage = Number(slippageBps) / 1e4;
  if (slippageBps > MAX_SLIPPAGE_BPS) {
    return {
      rule,
      status: "FAIL",
      message: `Slippage ${(effectiveSlippage * 100).toFixed(3)}% (${slippageBps} bps) exceeds ${(limit * 100).toFixed(1)}% maximum (${MAX_SLIPPAGE_BPS} bps)`,
      actual: effectiveSlippage,
      limit
    };
  }
  return {
    rule,
    status: "PASS",
    message: `Slippage ${(effectiveSlippage * 100).toFixed(3)}% (${slippageBps} bps) \u2264 ${(limit * 100).toFixed(1)}% (${MAX_SLIPPAGE_BPS} bps) \u2713`,
    actual: effectiveSlippage,
    limit
  };
}
function checkChainAllocation(chainId, chainName, targetWeight) {
  const rule = "MAX_CHAIN_ALLOCATION";
  const limit = GUARDRAILS.MAX_CHAIN_ALLOCATION;
  if (targetWeight > limit + 1e-9) {
    return {
      rule,
      status: "FAIL",
      message: `${chainName} target weight ${(targetWeight * 100).toFixed(1)}% exceeds ${(limit * 100).toFixed(0)}% cap`,
      actual: targetWeight,
      limit
    };
  }
  return {
    rule,
    status: "PASS",
    message: `${chainName} ${(targetWeight * 100).toFixed(1)}% \u2264 ${(limit * 100).toFixed(0)}% \u2713`,
    actual: targetWeight,
    limit
  };
}
function checkMovesPerDay(plannedMoves, executedToday = 0) {
  const rule = "MAX_MOVES_PER_DAY";
  const limit = GUARDRAILS.MAX_MOVES_PER_DAY;
  const total = executedToday + plannedMoves;
  if (total > limit) {
    const allowed = Math.max(limit - executedToday, 0);
    return {
      rule,
      status: "FAIL",
      message: `${plannedMoves} planned + ${executedToday} already executed = ${total} exceeds daily limit of ${limit}. Only ${allowed} more move(s) allowed today.`,
      actual: total,
      limit
    };
  }
  return {
    rule,
    status: "PASS",
    message: `${total} total moves (${executedToday} executed + ${plannedMoves} planned) \u2264 ${limit} \u2713`,
    actual: total,
    limit
  };
}
function validatePlan(plan, executedToday = 0) {
  const checks = [];
  const allowedMoves = [];
  const blockedMoves = [];
  for (const alloc of plan.allocations) {
    const check = checkChainAllocation(alloc.chainId, alloc.chainName, alloc.targetWeight);
    checks.push(check);
  }
  for (const move of plan.moves) {
    const txCheck = checkTxLimit(move);
    checks.push(txCheck);
    if (txCheck.status === "FAIL") {
      blockedMoves.push({ move, reason: txCheck.message });
    } else {
      allowedMoves.push(move);
    }
  }
  const dayCheck = checkMovesPerDay(allowedMoves.length, executedToday);
  checks.push(dayCheck);
  if (dayCheck.status === "FAIL") {
    const available = Math.max(GUARDRAILS.MAX_MOVES_PER_DAY - executedToday, 0);
    const overflow = allowedMoves.splice(available);
    for (const move of overflow) {
      blockedMoves.push({ move, reason: `Daily move budget exhausted (limit ${GUARDRAILS.MAX_MOVES_PER_DAY})` });
    }
  }
  const passed = checks.every((c) => c.status === "PASS") && blockedMoves.length === 0;
  return { passed, checks, allowedMoves, blockedMoves };
}
function validateQuote(quote, move) {
  const slippageCheck = checkSlippage(quote);
  const txCheck = checkTxLimit(move);
  if (slippageCheck.status === "FAIL") {
    return { safe: false, check: slippageCheck };
  }
  if (txCheck.status === "FAIL") {
    return { safe: false, check: txCheck };
  }
  return { safe: true, check: slippageCheck };
}
function formatGuardrailReport(report) {
  const lines = [
    `Guardrails: ${report.passed ? "ALL PASS" : "VIOLATIONS DETECTED"}`
  ];
  for (const check of report.checks) {
    const icon = check.status === "PASS" ? "\u2713" : "\u2717";
    lines.push(`  ${icon} [${check.rule}] ${check.message}`);
  }
  if (report.blockedMoves.length > 0) {
    lines.push(`
Blocked ${report.blockedMoves.length} move(s):`);
    for (const { move, reason } of report.blockedMoves) {
      lines.push(
        `  \u2717 $${move.amountUsd.toFixed(2)} ${move.fromChainName}\u2192${move.toChainName}: ${reason}`
      );
    }
  }
  if (report.allowedMoves.length > 0) {
    lines.push(`
Allowed ${report.allowedMoves.length} move(s):`);
    for (const move of report.allowedMoves) {
      lines.push(
        `  \u2713 $${move.amountUsd.toFixed(2)} ${move.fromChainName}\u2192${move.toChainName}`
      );
    }
  }
  return lines.join("\n");
}

// src/index.ts
import { execFile } from "child_process";
import { promisify } from "util";
var execFileAsync = promisify(execFile);
async function notify(text) {
  try {
    await execFileAsync("openclaw", [
      "message",
      "send",
      "--channel",
      "telegram",
      "--target",
      "477144117",
      "--message",
      text
    ]);
    console.log("[notify] Telegram \u2713");
  } catch (err) {
    console.warn("[notify] Failed to send Telegram notification:", err);
  }
}
async function fetchPortfolio() {
  const raw = await fetchAllUsdcBalances();
  const portfolio = {};
  const targetIds = Object.values(TARGET_CHAINS);
  for (const id of targetIds) {
    const bal = raw[id];
    if (bal !== void 0) portfolio[id] = bal;
  }
  return portfolio;
}
async function selectYieldToken(chainId, yieldOptions) {
  const chainOptions = yieldOptions.filter((e) => e.chainId === chainId);
  for (const option of chainOptions) {
    try {
      const health = await checkProtocolHealth(option.protocol, chainId);
      if (health.healthy) {
        console.log(
          `[yield] Selected ${option.protocol} on chain ${chainId} (APY ${option.apy.toFixed(2)}%)`
        );
        return option.depositToken;
      }
      console.warn(
        `[yield] ${option.protocol}@${chainId} unhealthy:`,
        health.alerts.join("; ")
      );
    } catch (err) {
      console.warn(`[yield] Health check failed for ${option.protocol}@${chainId}:`, err);
    }
  }
  const fallback = getBestYieldToken(chainId);
  console.warn(`[yield] No healthy protocol found for chain ${chainId}, using fallback ${fallback.protocol}`);
  return fallback.address;
}
async function executeMove(move, yieldOptions = []) {
  const amountUnits = Math.round(move.amountUsd * 1e6).toString();
  console.log(
    `[exec] ${move.fromChainName} \u2192 ${move.toChainName}  $${move.amountUsd.toFixed(2)} USDC`
  );
  const toToken = await selectYieldToken(move.toChainId, yieldOptions);
  const fromToken = USDC_ADDRESSES[move.fromChainId];
  let quote;
  try {
    quote = await lifi.getQuote({
      fromChain: move.fromChainId,
      toChain: move.toChainId,
      fromToken,
      toToken,
      fromAmount: amountUnits,
      fromAddress: WALLET.ADDRESS,
      slippage: GUARDRAILS.MAX_SLIPPAGE,
      order: GUARDRAILS.ROUTE_ORDER
    });
  } catch (err) {
    const error = `Quote failed: ${String(err)}`;
    console.error(`[exec] ${error}`);
    return { move, success: false, error };
  }
  const { safe, check } = validateQuote(quote, move);
  if (!safe) {
    const error = `Guardrail blocked: [${check.rule}] ${check.message}`;
    console.error(`[exec] ${error}`);
    return { move, success: false, error };
  }
  console.log(`[exec] Guardrail OK: ${check.message}`);
  let txHash;
  try {
    const txReq = {
      ...quote.transactionRequest,
      approvalAddress: quote.estimate?.approvalAddress,
      fromToken: quote.action?.fromToken?.address,
      fromAmount: quote.action?.fromAmount
    };
    const broadcast = await signAndBroadcast(txReq);
    txHash = broadcast.txHash;
  } catch (err) {
    const error = `Broadcast failed: ${String(err)}`;
    console.error(`[exec] ${error}`);
    return { move, success: false, error };
  }
  await notify(
    `\u{1F680} ChainPilot move started
${move.fromChainName} \u2192 ${move.toChainName}
Amount: $${move.amountUsd.toFixed(2)} USDC
Bridge: ${quote.tool}
Tx: ${txHash}`
  );
  const track = await trackTransaction(
    txHash,
    quote.tool,
    move.fromChainId,
    move.toChainId
  );
  const finalStatus = track.finalStatus.status;
  const elapsed = Math.round(track.elapsedMs / 1e3);
  const statusLabel = track.timedOut ? `timed out after ${Math.round(track.elapsedMs / 6e4)}m` : `${finalStatus} in ${elapsed}s`;
  const icon = finalStatus === "DONE" ? "\u2705" : "\u274C";
  await notify(
    `${icon} ChainPilot move ${finalStatus}
${move.fromChainName} \u2192 ${move.toChainName}
$${move.amountUsd.toFixed(2)} USDC \u2014 ${statusLabel}
Tx: ${txHash}`
  );
  return {
    move,
    success: finalStatus === "DONE",
    txHash,
    statusLabel
  };
}
async function main() {
  const runAt = (/* @__PURE__ */ new Date()).toISOString();
  console.log(`
${"\u2550".repeat(55)}`);
  console.log(`ChainPilot cycle  ${runAt}`);
  console.log(`${"\u2550".repeat(55)}
`);
  await notify(`\u{1F916} ChainPilot cycle starting
${runAt}`);
  console.log("[1/4] Collecting intel...");
  const [signalReport, portfolio] = await Promise.all([
    generateSignalReport(),
    fetchPortfolio()
  ]);
  const totalUsd = Object.values(portfolio).reduce((s, v) => s + (v ?? 0), 0);
  console.log(
    `[1/4] Signal complete \u2014 top chain: ${signalReport.chains[0]?.chainName}, quality: ${signalReport.dataQualityOk}`
  );
  console.log(`[1/4] Portfolio total: $${totalUsd.toFixed(2)} USDC`);
  console.log("[2/4] Computing allocation plan...");
  const plan = computeAllocation([signalReport], portfolio);
  console.log(`[2/4] ${plan.summary}`);
  if (!plan.dataQualityOk) {
    const msg = `\u26A0\uFE0F ChainPilot: data quality check failed \u2014 skipping execution.
` + plan.summary;
    console.warn("[2/4] " + msg);
    await notify(msg);
    return;
  }
  if (plan.moves.length === 0) {
    const msg = `\u2139\uFE0F ChainPilot: no moves needed.
${plan.summary}`;
    console.log("[2/4] " + msg);
    await notify(msg);
    return;
  }
  const guardrailReport = validatePlan(plan);
  console.log("[3/4] " + formatGuardrailReport(guardrailReport));
  if (guardrailReport.blockedMoves.length > 0) {
    const blockedSummary = guardrailReport.blockedMoves.map((b) => `  \u2717 $${b.move.amountUsd.toFixed(2)} ${b.move.fromChainName}\u2192${b.move.toChainName}: ${b.reason}`).join("\n");
    await notify(`\u26A0\uFE0F ChainPilot: ${guardrailReport.blockedMoves.length} move(s) blocked by guardrails:
${blockedSummary}`);
  }
  if (guardrailReport.allowedMoves.length === 0) {
    const msg = `\u26A0\uFE0F ChainPilot: all moves blocked by guardrails \u2014 skipping execution.
${plan.summary}`;
    console.warn("[3/4] " + msg);
    await notify(msg);
    return;
  }
  console.log(`[3/4] Executing ${guardrailReport.allowedMoves.length} allowed move(s)...`);
  const results = [];
  const yieldOptions = signalReport.yieldOptions ?? [];
  for (const move of guardrailReport.allowedMoves) {
    if (results.length >= GUARDRAILS.MAX_MOVES_PER_DAY) {
      console.warn("[3/4] MAX_MOVES_PER_DAY reached \u2014 stopping early.");
      break;
    }
    const result = await executeMove(move, yieldOptions);
    results.push(result);
    if (!result.success && GUARDRAILS.MAX_RETRIES >= 1 && !result.txHash) {
      console.log(`[3/4] Retrying failed move once...`);
      const retry = await executeMove(move, yieldOptions);
      results[results.length - 1] = retry;
    }
  }
  console.log("[4/4] Sending summary report...");
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const moveLines = results.map(
    (r) => `${r.success ? "\u2705" : "\u274C"} $${r.move.amountUsd.toFixed(2)} ${r.move.fromChainName}\u2192${r.move.toChainName}` + (r.statusLabel ? ` (${r.statusLabel})` : r.error ? ` (${r.error})` : "")
  ).join("\n");
  const report = `\u{1F4CA} ChainPilot cycle complete
${succeeded} succeeded, ${failed} failed
Portfolio: $${plan.totalPortfolioUsd.toFixed(2)} USDC
` + (moveLines ? moveLines + "\n" : "") + plan.summary;
  console.log("\n" + report.replace(/\n/g, "\n  "));
  await notify(report);
  console.log(`
[done] Cycle finished at ${(/* @__PURE__ */ new Date()).toISOString()}`);
}
main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
