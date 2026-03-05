/**
 * LI.FI REST API client
 * Maps the 5 MCP tools to direct HTTP calls against https://li.quest/v1
 *
 * MCP tool → REST endpoint mapping (per SPEC.md § Key APIs):
 *   get-connections → GET  /v1/connections
 *   get-tokens      → GET  /v1/tokens
 *   get-routes      → POST /v1/advanced/routes
 *   get-quote       → GET  /v1/quote
 *   get-status      → GET  /v1/status
 */

import type {
  GetConnectionsParams,
  GetConnectionsResponse,
  GetTokensParams,
  GetTokensResponse,
  GetRoutesParams,
  GetRoutesResponse,
  GetQuoteParams,
  GetQuoteResponse,
  GetStatusParams,
  GetStatusResponse,
} from './types.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://li.quest/v1';

import { readFileSync } from 'node:fs';

/** Load API key: env var → credential file */
function loadApiKey(): string {
  if (process.env.LIFI_API_KEY) return process.env.LIFI_API_KEY;
  try {
    const cred = JSON.parse(
      readFileSync(`${process.env.HOME}/.openclaw/credentials/lifi-api.json`, 'utf-8'),
    );
    return cred.api_key ?? '';
  } catch { return ''; }
}

const API_KEY = loadApiKey();

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers['x-lifi-api-key'] = API_KEY;
  }
  return headers;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      val.forEach((v) => qs.append(key, String(v)));
    } else {
      qs.set(key, String(val));
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

async function get<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const url = `${BASE_URL}${path}${toQueryString(params)}`;
  const res = await fetch(url, { headers: buildHeaders(), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    const body = await res.text();
    throw new LiFiApiError(res.status, `GET ${path} failed: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new LiFiApiError(res.status, `POST ${path} failed: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Error type ──────────────────────────────────────────────────────────────

export class LiFiApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'LiFiApiError';
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────

export const lifi = {
  /**
   * get-connections — discover which token pairs can be bridged between chains.
   * Use before get-routes to verify a route exists.
   */
  async getConnections(params: GetConnectionsParams = {}): Promise<GetConnectionsResponse> {
    const query: Record<string, unknown> = {
      fromChain: params.fromChain,
      toChain: params.toChain,
      fromToken: params.fromToken,
      toToken: params.toToken,
      chainTypes: params.chainTypes,
    };
    if (params.allowBridges?.length) {
      query['allowBridges'] = params.allowBridges;
    }
    return get<GetConnectionsResponse>('/connections', query);
  },

  /**
   * get-tokens — list all tokens supported on specified chains.
   * Pass chains as comma-separated IDs: "8453,42161,10,137,1"
   */
  async getTokens(params: GetTokensParams = {}): Promise<GetTokensResponse> {
    return get<GetTokensResponse>('/tokens', {
      chains: params.chains,
      chainTypes: params.chainTypes,
      minPriceUSD: params.minPriceUSD,
    });
  },

  /**
   * get-routes — find multiple route options for a swap/bridge.
   * Returns routes ranked by the specified order preference.
   */
  async getRoutes(params: GetRoutesParams): Promise<GetRoutesResponse> {
    // POST body mirrors the REST schema
    const body: Record<string, unknown> = {
      fromChainId: params.fromChainId,
      toChainId: params.toChainId,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      fromAmount: params.fromAmount,
    };
    if (params.fromAddress) body['fromAddress'] = params.fromAddress;
    if (params.toAddress) body['toAddress'] = params.toAddress;
    if (params.options) body['options'] = params.options;
    return post<GetRoutesResponse>('/advanced/routes', body);
  },

  /**
   * get-quote — get the single best route + unsigned transactionRequest.
   * IMPORTANT: returned transactionRequest must be signed externally (src/wallet/signer.ts).
   */
  async getQuote(params: GetQuoteParams): Promise<GetQuoteResponse> {
    const query: Record<string, unknown> = {
      fromChain: params.fromChain,
      toChain: params.toChain,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
    };
    if (params.toAddress) query['toAddress'] = params.toAddress;
    if (params.slippage !== undefined) query['slippage'] = params.slippage;
    if (params.allowBridges?.length) query['allowBridges'] = params.allowBridges.join(',');
    if (params.allowExchanges?.length) query['allowExchanges'] = params.allowExchanges.join(',');
    if (params.order) query['order'] = params.order;
    return get<GetQuoteResponse>('/quote', query);
  },

  /**
   * get-status — poll the status of an in-progress or completed bridge transfer.
   * Poll until status === 'DONE' | 'FAILED'.
   */
  async getStatus(params: GetStatusParams): Promise<GetStatusResponse> {
    return get<GetStatusResponse>('/status', {
      txHash: params.txHash,
      bridge: params.bridge,
      fromChain: params.fromChain,
      toChain: params.toChain,
    });
  },
} as const;
