# 🧭 ChainPilot

**Cross-chain narrative allocator** — an AI agent that automatically distributes stablecoin capital across DeFi yield protocols and chains, using on-chain data + anomaly detection to maximize risk-adjusted returns.

Built for the [LI.FI Vibeathon](https://li.fi) 🦎

## What It Does

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐
│  📡 Intel   │───▶│  🧠 Decision │───▶│  🔀 Execute  │───▶│  📊 Report │
│  Yield scan │    │  Allocator   │    │  LI.FI bridge│    │  Telegram  │
│  DeFiLlama  │    │  Guardrails  │    │  + deposit   │    │  alerts    │
│  Signals    │    │  Risk check  │    │  + approve   │    │            │
└─────────────┘    └──────────────┘    └──────────────┘    └────────────┘
                                              ▲
                                              │
                                    ┌─────────┴────────┐
                                    │  🛡️ Sentinel     │
                                    │  TVL monitoring   │
                                    │  Depeg detection  │
                                    │  Emergency evac   │
                                    └──────────────────┘
```

**One command** runs a full cycle: scan yields → pick best risk-adjusted allocation → bridge via LI.FI → deposit into yield protocols → monitor for anomalies.

## Supported Protocols & Chains

| Protocol | Type | Chains | Current APY |
|----------|------|--------|-------------|
| **Ethena sUSDe** | Staking/rebase | Ethereum, Base, Arbitrum | ~3.5% |
| **Aave v3 USDC** | Lending | Ethereum, Base, Arbitrum, Optimism, Polygon | ~2-3% |

| Chain | LI.FI Bridge | Yield |
|-------|-------------|-------|
| Ethereum (1) | ✅ | sUSDe + Aave |
| Base (8453) | ✅ | sUSDe + Aave |
| Arbitrum (42161) | ✅ | sUSDe + Aave |
| Optimism (10) | ✅ | Aave |
| Polygon (137) | ✅ | Aave |

## Architecture

```
src/
├── intel/              # Data gathering
│   ├── yield.ts        # Multi-protocol APY fetcher (Ethena + Aave)
│   ├── defillama.ts    # DeFiLlama API client
│   ├── signal.ts       # TVL momentum + narrative signals
│   └── lifi-scanner.ts # LI.FI route scanner
├── main/               # Decision engine
│   ├── allocator.ts    # Capital allocation algorithm
│   ├── guardrails.ts   # Risk limits (BigInt precision)
│   └── reporter.ts     # Telegram notifications
├── sentinel/           # Monitoring & safety
│   ├── monitor.ts      # 3-tier TVL + depeg + pause detection
│   └── evacuate.ts     # Emergency withdrawal + redeployment
├── wallet/             # Execution
│   ├── signer.ts       # Transaction signing + ERC20 approvals
│   └── tracker.ts      # Bridge status tracking (incl. Mayan fallback)
├── lifi/               # LI.FI integration
│   ├── client.ts       # MCP server + REST API wrapper
│   └── types.ts        # TypeScript types
├── config.ts           # Chains, RPCs, protocol addresses, guardrails
└── index.ts            # Main orchestrator — full cycle runner
```

## LI.FI Integration

ChainPilot uses **LI.FI MCP Server** + REST API for all cross-chain operations:

- **`getConnections`** — Discover available bridge routes between chains
- **`getQuote`** — Get optimal bridge quotes with slippage protection
- **`getRoutes`** — Multi-step route planning (bridge + swap + deposit)
- **`postStepTransaction`** — Execute bridge transactions
- **`getStatus`** — Track bridge completion with Mayan fallback

All bridges go through LI.FI's aggregator (`0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE`), which finds the best route across 20+ bridges.

## Guardrails

| Rule | Limit | Why |
|------|-------|-----|
| Max per chain | 40% of portfolio | Diversification |
| Max per transaction | $20 | Risk limit |
| Max moves per day | 6 | Gas efficiency |
| Max slippage | 1.5% | MEV protection |
| APY cap (Ethena) | 50% | Anomaly filter |

## Sentinel — Anomaly Detection

3-tier health monitoring with automatic fallback:

```
TVL Check:
  Tier 1: totalAssets()              ← ERC4626 standard
  Tier 2: convertToAssets(supply)    ← rebase tokens (sUSDe on Eth)
  Tier 3: DeFiLlama API             ← bridged tokens (sUSDe on Base/Arb)

Depeg Check:
  LI.FI quote: 1000 yieldToken → USDC
  Alert if output < $980 (>2% depeg)

Pause Check:
  Contract paused() call
```

**Emergency evacuation**: TVL drop ≥10% OR depeg >2% → auto-withdraw → USDC → redeploy to healthy protocol. 30-second cancel window with nonce-authenticated cancel file.

## Backtest Results

24-month simulation (Apr 2024 → Mar 2026):

| Strategy | Final Value | Effective APY |
|----------|-------------|---------------|
| **ChainPilot** (Ethena+Aave auto-switch) | $12,060 | **9.8%** |
| Ethena only | $12,060 | 9.8% |
| Aave only | $11,032 | 5.0% |
| USDC hold | $10,000 | 0% |

The real alpha is **anomaly avoidance** — automatically pulling capital during protocol stress events that would cause losses in passive strategies.

## Live Results

First full cycle (2026-03-05):
- **Input**: $10.66 USDC on Ethereum
- **Allocation**: Base 2.837 sUSDe + Arbitrum 2.517 sUSDe + Ethereum $4.01 USDC
- **Bridge**: LI.FI → Mayan (34s avg settlement)
- **Status**: Earning yield ✅

## Quick Start

```bash
# Install
npm install

# Configure (set wallet key path + Telegram chat ID in config)
cp config/example.env .env

# Build
npm run build

# Run one cycle
node dist/index.js

# Monitor only (no trades)
node -e "import('./dist/index.js')" -- --monitor-only
```

## Requirements

- Node.js ≥ 18
- LI.FI API key ([portal.li.fi](https://portal.li.fi))
- EVM wallet with USDC + gas on target chains
- Telegram bot token (for notifications)

## Tech Stack

- **TypeScript** + tsup (ESM)
- **ethers.js v6** — wallet, contracts, BigInt arithmetic
- **LI.FI SDK** — cross-chain bridges + swaps
- **DeFiLlama API** — yield data + TVL monitoring
- **Telegram Bot API** — real-time notifications

## Budget

Designed for small portfolios: $50 test funds + $5 gas. All guardrails enforce conservative limits suitable for autonomous operation.

---

Built by [Clawdia](https://x.com/clawdia_chan) 🐾 for the LI.FI Vibeathon 2026
