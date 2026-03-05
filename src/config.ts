/**
 * ChainPilot global configuration
 * Chains, guardrails, thresholds — all tunable here.
 * DO NOT put private keys here. Keys load from ~/.config/clawnch/wallet.json at runtime.
 */

// ─── Target chains ────────────────────────────────────────────────────────────

export const TARGET_CHAINS = {
  ETHEREUM: 1,
  OPTIMISM: 10,
  POLYGON: 137,
  ARBITRUM: 42161,
  BASE: 8453,
} as const;

export type TargetChainId = (typeof TARGET_CHAINS)[keyof typeof TARGET_CHAINS];

/** Chain IDs as comma-separated string for LI.FI token queries */
export const CHAIN_IDS_CSV = Object.values(TARGET_CHAINS).join(',');

// ─── Testnet chains (Base Sepolia for testing) ────────────────────────────────

export const TESTNET_CHAINS = {
  BASE_SEPOLIA: 84532,
} as const;

// ─── Native USDC addresses per chain ─────────────────────────────────────────
// Source: Circle official docs

export const USDC_ADDRESSES: Record<TargetChainId, string> = {
  [TARGET_CHAINS.ETHEREUM]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  [TARGET_CHAINS.OPTIMISM]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  [TARGET_CHAINS.POLYGON]: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  [TARGET_CHAINS.ARBITRUM]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  [TARGET_CHAINS.BASE]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

// ─── Guardrails (HARD RULES from SPEC.md) ─────────────────────────────────────

export const GUARDRAILS = {
  /** Maximum allocation fraction per chain (0–1) */
  MAX_CHAIN_ALLOCATION: 0.40,

  /** Maximum USD value per transaction */
  MAX_TX_USD: 20,

  /** Maximum bridge/swap moves per day */
  MAX_MOVES_PER_DAY: 6,

  /** Maximum acceptable slippage (LI.FI uses decimal, e.g. 0.015 = 1.5%) */
  MAX_SLIPPAGE: 0.015,

  /** Number of retries on bridge failure before stopping */
  MAX_RETRIES: 1,

  /** Default bridge order preference */
  ROUTE_ORDER: 'RECOMMENDED' as const,
} as const;

// ─── Signal thresholds ────────────────────────────────────────────────────────

export const SIGNAL_THRESHOLDS = {
  /** Minimum TVL change % (24h) to register as a positive signal */
  TVL_CHANGE_POSITIVE_PCT: 5,

  /** TVL change % below this is a negative signal */
  TVL_CHANGE_NEGATIVE_PCT: -5,

  /** Minimum confidence score (0–1) to execute a trade */
  MIN_CONFIDENCE: 0.65,
} as const;

// ─── Wallet ───────────────────────────────────────────────────────────────────

export const WALLET = {
  ADDRESS: '0xBB6FdC629a153E2bF7629032A3Bf99aec8b48938',
  /** Loaded at runtime — never hardcoded */
  KEY_FILE: `${process.env.HOME}/.config/clawnch/wallet.json`,
} as const;

// ─── Public RPC endpoints per chain ──────────────────────────────────────────
// Used for on-chain reads (e.g., Aave getReserveData). No API key required.

export const RPC_URLS: Record<TargetChainId, string> = {
  [TARGET_CHAINS.ETHEREUM]: 'https://eth.llamarpc.com',
  [TARGET_CHAINS.OPTIMISM]: 'https://mainnet.optimism.io',
  [TARGET_CHAINS.POLYGON]: 'https://polygon-bor-rpc.publicnode.com',
  [TARGET_CHAINS.ARBITRUM]: 'https://arb1.arbitrum.io/rpc',
  [TARGET_CHAINS.BASE]: 'https://mainnet.base.org',
} as const;

// ─── Yield token addresses per chain ──────────────────────────────────────────
// Priority: Ethena sUSDe (primary) > Aave v3 aUSDC (fallback).
// Chains without Ethena support only have Aave.

export interface YieldTokenConfig {
  ethena?: { sUSDe: string };
  aave?: { aUSDC: string; poolAddress: string };
}

export const YIELD_TOKENS: Record<TargetChainId, YieldTokenConfig> = {
  [TARGET_CHAINS.ETHEREUM]: {
    ethena: { sUSDe: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497' },
    aave: {
      aUSDC: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c',
      poolAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    },
  },
  [TARGET_CHAINS.OPTIMISM]: {
    aave: {
      aUSDC: '0x38d693cE1dF5AaDF7bC62595A37D667aD57922e5',
      poolAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    },
  },
  [TARGET_CHAINS.POLYGON]: {
    aave: {
      aUSDC: '0xA4D94019934D8333Ef880ABFFbF2FDd611C762BD',
      poolAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    },
  },
  [TARGET_CHAINS.ARBITRUM]: {
    ethena: { sUSDe: '0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2' },
    aave: {
      aUSDC: '0x724dc807b04555b71ed48a6896b6F41593b8C637',
      poolAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    },
  },
  [TARGET_CHAINS.BASE]: {
    ethena: { sUSDe: '0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2' },
    aave: {
      aUSDC: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',
      poolAddress: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    },
  },
} as const;

// ─── Multi-protocol yield addresses ──────────────────────────────────────────
// Covers Ethena sUSDe, Maple syrupUSDC, and Aave v3 aUSDC.
// depositToken = receipt/yield token; vaultAddress = contract to call for data.

export interface YieldProtocolConfig {
  /** Token you deposit to enter the protocol (e.g. USDC for Maple, sUSDe for Ethena) */
  depositToken: string;
  /** Token you receive/hold in the vault (e.g. syrupUSDC for Maple). Defaults to depositToken if absent. */
  receiptToken?: string;
  vaultAddress: string;
  /** Decimals of the receipt/yield token (used for depeg quote amounts and balance checks) */
  decimals: number;
}

export const YIELD_PROTOCOLS: { [protocol: string]: { [chainId: number]: YieldProtocolConfig } } = {
  ethena: {
    [TARGET_CHAINS.ETHEREUM]: {
      depositToken: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', // sUSDe (18 dec)
      vaultAddress: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497',
      decimals: 18,
    },
    [TARGET_CHAINS.BASE]: {
      depositToken: '0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2', // sUSDe (18 dec)
      vaultAddress: '0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2',
      decimals: 18,
    },
    [TARGET_CHAINS.ARBITRUM]: {
      depositToken: '0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2', // sUSDe (18 dec)
      vaultAddress: '0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2',
      decimals: 18,
    },
  },
  aave: {
    [TARGET_CHAINS.ETHEREUM]: {
      depositToken: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c', // aUSDC (6 dec)
      vaultAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      decimals: 6,
    },
    [TARGET_CHAINS.BASE]: {
      depositToken: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', // aUSDC (6 dec)
      vaultAddress: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
      decimals: 6,
    },
    [TARGET_CHAINS.ARBITRUM]: {
      depositToken: '0x724dc807b04555b71ed48a6896b6F41593b8C637', // aUSDC (6 dec)
      vaultAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      decimals: 6,
    },
    [TARGET_CHAINS.OPTIMISM]: {
      depositToken: '0x38d693cE1dF5AaDF7bC62595A37D667aD57922e5', // aUSDC (6 dec)
      vaultAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      decimals: 6,
    },
    [TARGET_CHAINS.POLYGON]: {
      depositToken: '0xA4D94019934D8333Ef880ABFFbF2FDd611C762BD', // aUSDC (6 dec)
      vaultAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      decimals: 6,
    },
  },
};

// ─── API endpoints ────────────────────────────────────────────────────────────

export const APIS = {
  LIFI_BASE: 'https://li.quest/v1',
  DEFILLAMA_CHAINS: 'https://api.llama.fi/v2/chains',
  DEFILLAMA_DEXS: 'https://api.llama.fi/overview/dexs?excludeTotalDataChart=true',
} as const;

// ─── LI.FI API Key (loaded from credential file) ─────────────────────────────

import { readFileSync } from 'node:fs';

function loadLifiApiKey(): string {
  // Prefer env var
  if (process.env.LIFI_API_KEY) return process.env.LIFI_API_KEY;
  // Fall back to credential file
  try {
    const cred = JSON.parse(
      readFileSync(`${process.env.HOME}/.openclaw/credentials/lifi-api.json`, 'utf-8'),
    );
    return cred.api_key ?? '';
  } catch {
    return '';
  }
}

export const LIFI_API_KEY = loadLifiApiKey();
