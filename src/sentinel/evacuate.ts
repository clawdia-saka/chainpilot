/**
 * Sentinel — emergency withdrawal (evacuate)
 *
 * When an alert fires:
 *   1. Build a LI.FI route: yieldToken → USDC (same or cross-chain)
 *   2. Send Telegram notification with alert details + planned action
 *   3. Wait 30 seconds for user override (cancel flag file check)
 *   4. If no cancel → execute withdrawal via LI.FI
 *   5. Redeposit into the next-best healthy protocol
 *
 * Export: evacuate(fromProtocol, fromChain, toProtocol, toChain)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { ethers } from 'ethers';
import { YIELD_PROTOCOLS, USDC_ADDRESSES, WALLET, GUARDRAILS, RPC_URLS } from '../config.js';
import type { TargetChainId } from '../config.js';
import { lifi } from '../lifi/client.js';
import { signAndBroadcast } from '../wallet/signer.js';
import { CANCEL_FILE } from './monitor.js';

const execFileAsync = promisify(execFile);

// ─── Notification ─────────────────────────────────────────────────────────────

async function notify(text: string): Promise<void> {
  try {
    await execFileAsync('openclaw', [
      'message', 'send',
      '--channel', 'telegram',
      '--target', '477144117',
      '--message', text,
    ]);
    console.log('[evacuate] Telegram ✓');
  } catch (err) {
    console.warn('[evacuate] Telegram notification failed:', err);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ERC20_ABI = ['function balanceOf(address account) view returns (uint256)'];

/** Query ERC20 balanceOf(WALLET.ADDRESS) for a token on a given chain. */
async function getERC20Balance(tokenAddress: string, chainId: TargetChainId): Promise<bigint> {
  const provider = new ethers.JsonRpcProvider(RPC_URLS[chainId]);
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return (token['balanceOf'] as (addr: string) => Promise<bigint>)(WALLET.ADDRESS);
}

/** Wait `ms` milliseconds, checking for cancel file every second. */
async function waitWithCancelCheck(ms: number): Promise<boolean> {
  const interval = 1_000;
  let elapsed = 0;
  while (elapsed < ms) {
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(interval, ms - elapsed)));
    elapsed += interval;
    if (existsSync(CANCEL_FILE)) {
      console.log('[evacuate] Cancel file detected — aborting.');
      return true; // cancelled
    }
  }
  return false; // not cancelled
}

/** Query actual vault token balance held by WALLET.ADDRESS. */
async function getWithdrawAmount(protocol: string, chainId: TargetChainId): Promise<string> {
  const config = YIELD_PROTOCOLS[protocol]?.[chainId];
  if (!config) return '0';
  // Use receiptToken (e.g. syrupUSDC) for balance check; fall back to depositToken
  const yieldToken = config.receiptToken ?? config.depositToken;
  try {
    const balance = await getERC20Balance(yieldToken, chainId);
    if (balance === 0n) {
      console.warn(`[evacuate] balanceOf returned 0 for ${protocol}@${chainId} — nothing to withdraw`);
    }
    return balance.toString();
  } catch (err) {
    console.warn(`[evacuate] balanceOf failed for ${protocol}@${chainId}:`, err);
    return '0';
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface EvacuateResult {
  success: boolean;
  cancelled: boolean;
  txHash?: string;
  redeployTxHash?: string;
  error?: string;
}

/**
 * Emergency withdrawal: exit fromProtocol on fromChain, redeposit into
 * toProtocol on toChain.
 *
 * Steps:
 *   1. Notify via Telegram
 *   2. 30-second override window (cancel file check)
 *   3. Quote + execute LI.FI route: yieldToken → USDC
 *   4. Quote + execute LI.FI route: USDC → toProtocol deposit token
 */
export async function evacuate(
  fromProtocol: string,
  fromChain: TargetChainId,
  toProtocol: string,
  toChain: TargetChainId,
): Promise<EvacuateResult> {
  const fromConfig = YIELD_PROTOCOLS[fromProtocol]?.[fromChain];
  const toConfig = YIELD_PROTOCOLS[toProtocol]?.[toChain];

  if (!fromConfig) {
    return { success: false, cancelled: false, error: `No config for ${fromProtocol}@chain${fromChain}` };
  }
  if (!toConfig) {
    return { success: false, cancelled: false, error: `No config for ${toProtocol}@chain${toChain}` };
  }

  const fromUsdcAddress = USDC_ADDRESSES[fromChain];
  const amount = await getWithdrawAmount(fromProtocol, fromChain);

  // ── Step 1: Notify ──────────────────────────────────────────────────────────
  const actionMsg =
    `🚨 ChainPilot ALERT — Emergency Evacuation\n` +
    `Protocol: ${fromProtocol} (chain ${fromChain})\n` +
    `Action: Withdraw → USDC, then redeposit into ${toProtocol} (chain ${toChain})\n` +
    `Send '${CANCEL_FILE}' touch within 30s to cancel.`;

  console.log('[evacuate] Sending alert:', actionMsg);
  await notify(actionMsg);

  // ── Step 2: 30-second override window ───────────────────────────────────────
  console.log('[evacuate] Waiting 30s for override...');
  const cancelled = await waitWithCancelCheck(30_000);
  if (cancelled) {
    await notify(`✋ ChainPilot evacuation CANCELLED by user override.`);
    return { success: false, cancelled: true };
  }

  // ── Step 3: Withdraw yieldToken → USDC ─────────────────────────────────────
  console.log(`[evacuate] Executing withdrawal: ${fromProtocol} → USDC`);
  // Use receiptToken (e.g. syrupUSDC for Maple) as the token to sell
  const fromYieldToken = fromConfig.receiptToken ?? fromConfig.depositToken;
  let withdrawTxHash: string;
  try {
    const quote = await lifi.getQuote({
      fromChain: fromChain,
      toChain: fromChain,
      fromToken: fromYieldToken,
      toToken: fromUsdcAddress,
      fromAmount: amount,
      fromAddress: WALLET.ADDRESS,
      slippage: GUARDRAILS.MAX_SLIPPAGE,
      order: GUARDRAILS.ROUTE_ORDER,
    });

    const txReq = {
      ...quote.transactionRequest,
      approvalAddress: (quote as unknown as Record<string, unknown>)?.['estimate']?.['approvalAddress' as never],
      fromToken: (quote as unknown as Record<string, unknown>)?.['action']?.['fromToken' as never]?.['address' as never],
      fromAmount: (quote as unknown as Record<string, unknown>)?.['action']?.['fromAmount' as never],
    };
    const broadcast = await signAndBroadcast(txReq as Parameters<typeof signAndBroadcast>[0]);
    withdrawTxHash = broadcast.txHash;
    console.log(`[evacuate] Withdrawal tx: ${withdrawTxHash}`);
  } catch (err) {
    const error = `Withdrawal failed: ${String(err)}`;
    console.error('[evacuate]', error);
    await notify(`❌ ChainPilot evacuation FAILED: ${error}`);
    return { success: false, cancelled: false, error };
  }

  // ── Step 4: Wait for withdrawal tx confirmation (C1+C2 fix) ───────────────
  // signAndBroadcast does NOT wait for mining. We must wait before querying
  // USDC balance — otherwise the tx is pending and balance will be stale/0.
  console.log(`[evacuate] Waiting for withdrawal tx to be mined (up to 60s)...`);
  try {
    const waitProvider = new ethers.JsonRpcProvider(RPC_URLS[fromChain], fromChain, { staticNetwork: true });
    const receipt = await waitProvider.waitForTransaction(withdrawTxHash, 1, 60_000);
    if (!receipt || receipt.status === 0) {
      const error = `Withdrawal tx ${withdrawTxHash} reverted on-chain (status: ${receipt?.status ?? 'null'})`;
      console.error('[evacuate]', error);
      await notify(`❌ ChainPilot evacuation FAILED: ${error}`);
      return { success: false, cancelled: false, txHash: withdrawTxHash, error };
    }
    console.log(`[evacuate] Withdrawal confirmed in block ${receipt.blockNumber}`);
  } catch (err) {
    const error = `Withdrawal tx confirmation timed out or failed: ${String(err)}`;
    console.error('[evacuate]', error);
    await notify(`❌ ChainPilot evacuation FAILED: ${error}\nWithdraw tx: ${withdrawTxHash}`);
    return { success: false, cancelled: false, txHash: withdrawTxHash, error };
  }

  // ── Step 5: Query actual USDC balance post-confirmation ────────────────────
  // Do NOT fall back to raw yield-token `amount` — decimal mismatch (18 vs 6)
  // would cause a trillion-dollar redeploy quote for sUSDe positions.
  console.log(`[evacuate] Redeploying into ${toProtocol}@chain${toChain}`);
  const toUsdcAddress = USDC_ADDRESSES[toChain];

  let redeployAmount: string;
  try {
    const usdcBalance = await getERC20Balance(fromUsdcAddress, fromChain);
    if (usdcBalance === 0n) {
      const error = `USDC balance is 0 after confirmed withdrawal — cannot redeploy safely`;
      console.error('[evacuate]', error);
      await notify(
        `❌ ChainPilot: withdrawal confirmed but USDC balance is 0.\n` +
        `Manual intervention required. Withdraw tx: ${withdrawTxHash}`,
      );
      return { success: false, cancelled: false, txHash: withdrawTxHash, error };
    }
    redeployAmount = usdcBalance.toString();
    console.log(`[evacuate] Actual USDC received: ${redeployAmount}`);
  } catch (err) {
    const error = `USDC balance check failed after withdrawal: ${String(err)}`;
    console.error('[evacuate]', error);
    await notify(
      `❌ ChainPilot: cannot safely redeploy — balance check failed.\n` +
      `Manual intervention required. Withdraw tx: ${withdrawTxHash}\nError: ${error}`,
    );
    return { success: false, cancelled: false, txHash: withdrawTxHash, error };
  }

  // Use receiptToken (e.g. syrupUSDC for Maple) as the destination yield token
  const toYieldToken = toConfig.receiptToken ?? toConfig.depositToken;

  let redeployTxHash: string;
  try {
    const redeployQuote = await lifi.getQuote({
      fromChain: fromChain,
      toChain: toChain,
      fromToken: fromUsdcAddress,
      toToken: toYieldToken,
      fromAmount: redeployAmount,
      fromAddress: WALLET.ADDRESS,
      toAddress: WALLET.ADDRESS,
      slippage: GUARDRAILS.MAX_SLIPPAGE,
      order: GUARDRAILS.ROUTE_ORDER,
    });

    const txReq2 = {
      ...redeployQuote.transactionRequest,
      approvalAddress: (redeployQuote as unknown as Record<string, unknown>)?.['estimate']?.['approvalAddress' as never],
      fromToken: (redeployQuote as unknown as Record<string, unknown>)?.['action']?.['fromToken' as never]?.['address' as never],
      fromAmount: (redeployQuote as unknown as Record<string, unknown>)?.['action']?.['fromAmount' as never],
    };
    const broadcast2 = await signAndBroadcast(txReq2 as Parameters<typeof signAndBroadcast>[0]);
    redeployTxHash = broadcast2.txHash;
    console.log(`[evacuate] Redeploy tx: ${redeployTxHash}`);
  } catch (err) {
    const error = `Redeploy failed: ${String(err)}`;
    console.error('[evacuate]', error);
    await notify(`⚠️ Withdrawal succeeded but redeploy FAILED: ${error}\nWithdraw tx: ${withdrawTxHash}`);
    return { success: false, cancelled: false, txHash: withdrawTxHash, error };
  }

  await notify(
    `✅ ChainPilot evacuation COMPLETE\n` +
    `Withdrew from ${fromProtocol}@chain${fromChain}: ${withdrawTxHash}\n` +
    `Redeployed into ${toProtocol}@chain${toChain}: ${redeployTxHash}`,
  );

  return { success: true, cancelled: false, txHash: withdrawTxHash, redeployTxHash };
}
