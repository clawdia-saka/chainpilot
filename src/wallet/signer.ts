/**
 * Wallet signer
 *
 * Loads the ethers.js wallet from ~/.config/clawnch/wallet.json,
 * signs a LI.FI transactionRequest, and broadcasts it to the chain.
 *
 * Key file format expected:
 *   { "address": "0x...", "privateKey": "0x..." }
 *
 * RPC endpoints come from config/chains.json (public nodes, no secrets).
 */

import { ethers } from 'ethers';
import { readFile } from 'node:fs/promises';
import { WALLET, USDC_ADDRESSES } from '../config.js';
import type { TransactionRequest } from '../lifi/types.js';

// ─── RPC map (sourced from config/chains.json) ────────────────────────────────
// Kept inline to avoid ESM JSON-import edge cases with different runtimes.

const RPC_BY_CHAIN_ID: Record<number, string> = {
  1:     'https://eth.llamarpc.com',
  10:    'https://mainnet.optimism.io',
  137:   'https://polygon-bor-rpc.publicnode.com',
  42161: 'https://arb1.arbitrum.io/rpc',
  8453:  'https://mainnet.base.org',
  84532: 'https://sepolia.base.org',
};

// ─── LI.FI known router allowlist (C1/C2) ────────────────────────────────────
// Hardcoded LI.FI diamond proxy addresses. Any quote whose `to` or
// `approvalAddress` is NOT in this set is rejected before signing.
// Source: https://docs.li.fi/smart-contracts/deployed-contracts
//
// IMPORTANT: Review and update this list when LI.FI deploys new proxy versions.
const LIFI_KNOWN_ROUTERS: ReadonlySet<string> = new Set([
  '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', // LI.FI Diamond (Ethereum, Optimism, Polygon, Arbitrum, Base + others)
  '0x341e94069f53234fe6dabef707ad424830525715', // LI.FI Diamond v2 (some chains)
]);

function assertKnownLifiRouter(address: string, role: string): void {
  if (!LIFI_KNOWN_ROUTERS.has(address.toLowerCase())) {
    throw new Error(
      `[signer] SECURITY: ${role} address ${address} is not a known LI.FI router. ` +
      `Refusing to sign. If this is a new LI.FI contract, add it to LIFI_KNOWN_ROUTERS ` +
      `after verifying on https://docs.li.fi/smart-contracts/deployed-contracts`,
    );
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface WalletFile {
  address: string;
  privateKey: string;
  [key: string]: unknown;
}

export interface BroadcastResult {
  txHash: string;
  chainId: number;
}

// ─── Private key loader (no caching — C3 fix) ────────────────────────────────
// The private key is loaded fresh from disk on each call and never stored in a
// module-level variable. This eliminates the window where a heap dump, v8
// inspector, or supply-chain attack can extract the key from process memory.

async function loadPrivateKey(): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(WALLET.KEY_FILE, 'utf-8');
  } catch (err) {
    throw new Error(
      `[signer] Cannot read wallet file at ${WALLET.KEY_FILE}: ${String(err)}`,
    );
  }

  let parsed: WalletFile;
  try {
    parsed = JSON.parse(raw) as WalletFile;
  } catch {
    throw new Error(`[signer] wallet.json is not valid JSON`);
  }

  if (typeof parsed.privateKey !== 'string' || !parsed.privateKey.startsWith('0x')) {
    throw new Error(`[signer] wallet.json missing a valid hex privateKey field`);
  }

  return parsed.privateKey;
}

// ─── Provider factory ─────────────────────────────────────────────────────────

function getProvider(chainId: number): ethers.JsonRpcProvider {
  const rpc = RPC_BY_CHAIN_ID[chainId];
  if (!rpc) {
    throw new Error(`[signer] No RPC URL configured for chainId ${chainId}`);
  }
  return new ethers.JsonRpcProvider(rpc, chainId, { staticNetwork: true });
}

// ─── Main exports ─────────────────────────────────────────────────────────────

/**
 * Sign and broadcast a LI.FI transactionRequest.
 *
 * Validates that the signing address matches WALLET.ADDRESS before sending.
 * Returns the tx hash immediately after submission (does NOT wait for mining).
 * Use tracker.ts to poll for finality.
 */
/**
 * Ensure the bridge/swap contract has sufficient ERC20 allowance.
 * If current allowance < amount, sends an approve tx and waits for confirmation.
 */
async function ensureApproval(
  wallet: ethers.Wallet,
  tokenAddress: string,
  spender: string,
  amount: bigint,
): Promise<void> {
  const erc20 = new ethers.Contract(tokenAddress, [
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
  ], wallet);

  // C1: Validate spender against known LI.FI router allowlist before any approval.
  assertKnownLifiRouter(spender, 'approvalAddress/spender');

  const current = await erc20.allowance(wallet.address, spender) as bigint;
  if (current >= amount) {
    console.log(`[signer] Allowance OK (${current} >= ${amount})`);
    return;
  }

  // C1: Approve only the exact required amount — never unlimited uint256.max.
  // This limits exposure if the spender address is ever compromised.
  console.log(`[signer] Approving ${tokenAddress} for spender ${spender} (amount: ${amount})...`);
  const approveTx = await erc20.approve(spender, amount);
  console.log(`[signer] Approve tx: ${approveTx.hash}`);
  await approveTx.wait(1);
  console.log(`[signer] Approve confirmed`);
}

export async function signAndBroadcast(txReq: TransactionRequest): Promise<BroadcastResult> {
  const privateKey = await loadPrivateKey();
  const provider = getProvider(txReq.chainId);
  const wallet = new ethers.Wallet(privateKey, provider);

  // Address sanity check
  if (wallet.address.toLowerCase() !== WALLET.ADDRESS.toLowerCase()) {
    throw new Error(
      `[signer] Address mismatch: wallet has ${wallet.address}, config expects ${WALLET.ADDRESS}`,
    );
  }

  // ERC20 approval: if the quote includes approval data, handle it
  if (txReq.approvalAddress && txReq.fromToken && txReq.fromAmount) {
    await ensureApproval(
      wallet,
      txReq.fromToken,
      txReq.approvalAddress,
      BigInt(txReq.fromAmount),
    );
  }

  // C2: Validate destination contract against known LI.FI router allowlist.
  // Rejects any quote whose `to` field points at an unrecognised contract.
  if (!txReq.to) {
    throw new Error('[signer] SECURITY: txReq.to is missing — refusing to sign');
  }
  assertKnownLifiRouter(txReq.to, 'txReq.to');

  const tx: ethers.TransactionRequest = {
    to:      txReq.to,
    data:    txReq.data,
    value:   txReq.value ? BigInt(txReq.value) : 0n,
    chainId: txReq.chainId,
  };

  // Use gas params from LI.FI if provided (they've already estimated them)
  if (txReq.gasPrice) tx.gasPrice = BigInt(txReq.gasPrice);
  if (txReq.gasLimit) tx.gasLimit = BigInt(txReq.gasLimit);

  const sent = await wallet.sendTransaction(tx);
  console.log(`[signer] Submitted tx ${sent.hash} on chain ${txReq.chainId}`);

  return { txHash: sent.hash, chainId: txReq.chainId };
}

/**
 * Read the USDC balance for WALLET.ADDRESS on a given chain.
 * Returns the balance as a plain USD float (1 USDC = 1.0).
 */
export async function getUsdcBalance(
  chainId: number,
  usdcAddress: string,
  decimals = 6,
): Promise<number> {
  const provider = getProvider(chainId);
  const abi = ['function balanceOf(address owner) view returns (uint256)'];
  const contract = new ethers.Contract(usdcAddress, abi, provider);
  const raw = await contract.balanceOf(WALLET.ADDRESS) as bigint;
  return Number(raw) / 10 ** decimals;
}

/**
 * Fetch USDC balances for all target chains.
 * Returns a map of chainId → USD float.
 */
export async function fetchAllUsdcBalances(): Promise<Partial<Record<number, number>>> {
  const entries = Object.entries(USDC_ADDRESSES) as [string, string][];
  const balances: Partial<Record<number, number>> = {};

  const results = await Promise.allSettled(
    entries.map(async ([chainIdStr, addr]) => {
      const chainId = Number(chainIdStr);
      const bal = await getUsdcBalance(chainId, addr);
      return { chainId, bal };
    }),
  );

  for (const res of results) {
    if (res.status === 'fulfilled') {
      balances[res.value.chainId] = res.value.bal;
    } else {
      console.warn('[signer] Balance fetch failed:', res.reason);
    }
  }

  return balances;
}
