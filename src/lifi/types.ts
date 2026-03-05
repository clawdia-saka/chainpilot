// LI.FI API TypeScript types
// REST base: https://li.quest/v1
// Reference: SPEC.md § Key APIs

// ─── Shared primitives ───────────────────────────────────────────────────────

export type ChainId = number;
export type TokenAddress = string; // 0x-prefixed or symbol alias

export interface NativeToken {
  address: string;
  symbol: string;
  decimals: number;
  chainId: ChainId;
  name: string;
  priceUSD?: string;
  logoURI?: string;
}

export interface Token {
  address: string;
  symbol: string;
  decimals: number;
  chainId: ChainId;
  name: string;
  priceUSD?: string;
  logoURI?: string;
  coinKey?: string;
}

export interface Chain {
  id: ChainId;
  key: string;
  name: string;
  chainType: 'EVM' | 'SVM';
  nativeToken: NativeToken;
  metamask?: {
    chainId: string;
    chainName: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: string[];
    blockExplorerUrls: string[];
  };
  multicallAddress?: string;
}

// ─── Gas & Fee ────────────────────────────────────────────────────────────────

export interface GasCost {
  type: 'SUM' | 'DEFAULT' | 'APPROVE' | 'SEND';
  price?: string;
  estimate?: string;
  limit?: string;
  amount: string;
  amountUSD?: string;
  token: Token;
}

export interface FeeCost {
  name: string;
  description?: string;
  percentage?: string;
  token: Token;
  amount?: string;
  amountUSD?: string;
  included: boolean;
}

// ─── get-connections ─────────────────────────────────────────────────────────

export interface GetConnectionsParams {
  fromChain?: ChainId;
  toChain?: ChainId;
  fromToken?: string;
  toToken?: string;
  chainTypes?: string; // 'EVM' | 'SVM' | 'EVM,SVM'
  allowBridges?: string[];
}

export interface Connection {
  fromChainId: ChainId;
  toChainId: ChainId;
  fromTokens: Token[];
  toTokens: Token[];
}

export interface GetConnectionsResponse {
  connections: Connection[];
}

// ─── get-tokens ───────────────────────────────────────────────────────────────

export interface GetTokensParams {
  chains?: string; // comma-separated chain IDs e.g. "8453,42161,10"
  chainTypes?: string;
  minPriceUSD?: string;
}

/** tokens keyed by chain ID string */
export type TokenMap = Record<string, Token[]>;

export interface GetTokensResponse {
  tokens: TokenMap;
}

// ─── get-routes ───────────────────────────────────────────────────────────────

export interface RouteOptions {
  slippage?: number;
  bridges?: { allow?: string[]; deny?: string[] };
  exchanges?: { allow?: string[]; deny?: string[] };
  order?: 'RECOMMENDED' | 'FASTEST' | 'CHEAPEST' | 'SAFEST';
  maxPriceImpact?: number;
  allowSwitchChain?: boolean;
}

export interface GetRoutesParams {
  fromChainId: ChainId;
  toChainId: ChainId;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;        // wei
  fromAddress?: string;
  toAddress?: string;
  options?: RouteOptions;
}

export interface StepAction {
  fromChainId: ChainId;
  toChainId: ChainId;
  fromToken: Token;
  toToken: Token;
  fromAmount: string;
  toAmount: string;
  slippage: number;
  fromAddress: string;
  toAddress: string;
}

export interface StepEstimate {
  tool: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  approvalAddress: string;
  executionDuration: number; // seconds
  feeCosts: FeeCost[];
  gasCosts: GasCost[];
}

export interface Step {
  id: string;
  type: 'swap' | 'cross' | 'lifi';
  tool: string;
  toolDetails: { key: string; name: string; logoURI?: string };
  action: StepAction;
  estimate: StepEstimate;
  includedSteps?: Step[];
  transactionRequest?: TransactionRequest;
}

export interface Route {
  id: string;
  fromChainId: ChainId;
  toChainId: ChainId;
  fromAmountUSD?: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  toAmountUSD?: string;
  gasCostUSD?: string;
  fromToken: Token;
  toToken: Token;
  steps: Step[];
  tags?: Array<'RECOMMENDED' | 'FASTEST' | 'CHEAPEST' | 'SAFEST'>;
  insurance?: { state: string; feeAmountUsd: string };
}

export interface GetRoutesResponse {
  routes: Route[];
}

// ─── get-quote ────────────────────────────────────────────────────────────────

export interface GetQuoteParams {
  fromChain: ChainId | string;
  toChain: ChainId | string;
  fromToken: string;        // address or symbol
  toToken: string;
  fromAmount: string;       // wei
  fromAddress: string;
  toAddress?: string;
  slippage?: number;        // e.g. 0.015 for 1.5%
  allowBridges?: string[];
  allowExchanges?: string[];
  order?: RouteOptions['order'];
}

export interface TransactionRequest {
  data: string;
  to: string;
  value: string;
  from: string;
  chainId: ChainId;
  gasPrice?: string;
  gasLimit?: string;
  /** Spender address for ERC20 approval (from LI.FI quote) */
  approvalAddress?: string;
  /** Source token address (for approval) */
  fromToken?: string;
  /** Source amount in smallest unit (for approval) */
  fromAmount?: string;
}

export interface GetQuoteResponse {
  type: string;
  id: string;
  tool: string;
  toolDetails: { key: string; name: string; logoURI?: string };
  action: StepAction;
  estimate: StepEstimate;
  includedSteps: Step[];
  transactionRequest: TransactionRequest;
}

// ─── get-status ───────────────────────────────────────────────────────────────

export interface GetStatusParams {
  txHash: string;
  bridge?: string;
  fromChain?: ChainId | string;
  toChain?: ChainId | string;
}

export type TxStatus = 'PENDING' | 'DONE' | 'FAILED' | 'NOT_FOUND' | 'INVALID';

export interface TxInfo {
  txHash?: string;
  txLink?: string;
  amount?: string;
  token?: Token;
  chainId?: ChainId;
  gasPrice?: string;
  gasUsed?: string;
  gasToken?: Token;
  gasAmount?: string;
  gasAmountUSD?: string;
  amountUSD?: string;
  address?: string;
  timestamp?: number;
}

export interface GetStatusResponse {
  transactionId?: string;
  sending: TxInfo;
  receiving: TxInfo;
  status: TxStatus;
  subStatus?: string;
  lifiExplorerLink?: string;
  fromAddress?: string;
  toAddress?: string;
  tool?: string;
  bridge?: string;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export interface LiFiError {
  message: string;
  code?: number;
  action?: string;
}
