# 🧭 ChainPilot

**Turn cross-chain noise into prioritized action.**

Built for funds, treasuries, and power users who need faster, safer on-chain decisions — not another dashboard.

*Deterministic signals. Visible provenance. Graceful degradation. Optional guardrailed execution.*

---

## What is ChainPilot?

ChainPilot is an **action-first decision layer** for cross-chain operations. Instead of showing more data, it compresses signal-to-action time by detecting meaningful on-chain events, ranking what matters, and helping operators make safe decisions faster.

The critical path is **deterministic, not LLM-driven**, with multi-source fallback and execution guardrails built in.

### Why not another dashboard?

| | Traditional Dashboards | ChainPilot |
|---|---|---|
| **Shows** | What happened | What to prioritize |
| **Decision** | Left to user | Compressed to seconds |
| **Data trust** | Assumed | Source, method, freshness visible |
| **Failure mode** | Blank screen | Graceful degradation + fallback |
| **Execution** | Manual | Optional, guardrailed |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    ChainPilot                        │
├──────────┬──────────┬──────────┬────────────────────┤
│  Intel   │ Decision │ Sentinel │    Execution        │
│          │  Engine  │ Monitor  │                     │
│ DeFiLlama│ Determin-│ TVL drop │ LI.FI bridge/swap  │
│ Ethena   │ istic    │ Depeg    │ ERC20 approve       │
│ Aave     │ scoring  │ Pause    │ Guardrail gate      │
│ LI.FI    │ Risk-adj │ Fallback │ Track & confirm     │
└──────────┴──────────┴──────────┴────────────────────┘
     ↓           ↓           ↓            ↓
  Signals → Priorities → Health → Safe Action
```

### Data Pipeline (3-tier fallback)

```
Tier 1: On-chain reads (totalAssets, convertToAssets)
    ↓ revert?
Tier 2: ERC4626 method fallback (convertToAssets(totalSupply))
    ↓ revert?
Tier 3: DeFiLlama API (external TVL aggregator)
```

When the measurement methodology changes between cycles, **comparisons are automatically skipped** to prevent phantom alerts from unit mismatches.

---

## Key Design Decisions

### 🧠 No LLM in the critical path
Signal detection and allocation are **purely numerical** — TVL change rates, APY comparisons, DEX volume, risk-adjusted scoring. No hallucination risk, no prompt injection surface in the decision loop.

> Phase 2 will add LLM as an **advisory signal layer** (CT sentiment, governance proposals) — but guardrails will always have final authority.

### 📊 Visible data provenance
Every metric shows its **source**, **method**, **freshness**, and **confidence level**. When a source degrades, the UI shows the fallback state explicitly rather than hiding it.

### 🛡️ Execution guardrails (hard rules)

| Rule | Limit |
|------|-------|
| Max allocation per chain | 40% |
| Max per transaction | $20 |
| Max moves per day | 6 |
| Max slippage | 1.5% |
| Quote deterioration | 98.5% threshold |
| Bridge failure | 1 retry → stop → notify |

### 🔄 Graceful degradation
- DeFiLlama down → fallback to cached last-known-good snapshot
- RPC timeout → extended timeout + provider rotation (PublicNode)
- Method change → comparison skipped, new baseline established
- No data source failure produces a blank screen

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js + TypeScript |
| Cross-chain | [LI.FI](https://li.fi) REST API (MCP-compatible) |
| On-chain data | ethers.js v6 + public RPCs (PublicNode) |
| Yield sources | Ethena sUSDe (primary) + Aave v3 USDC (fallback) |
| Market data | DeFiLlama (TVL, DEX volume) |
| Dashboard | React + Vite + Tailwind CSS |
| Notifications | Telegram via OpenClaw |
| Hosting | Vercel (static dashboard) |

---

## Live Demo

🌐 **Dashboard**: [chainpilot-dashboard.vercel.app](https://chainpilot-dashboard.vercel.app)

The dashboard runs in **demo mode** (read-only, no wallet signature required). It demonstrates the full UI including data provenance, freshness indicators, degraded state banners, and the decision pipeline.

---

## Competitive Positioning

| Tool | Primary Use | ChainPilot Difference |
|------|------------|----------------------|
| Dune | Analysis & visualization | User still interprets; ChainPilot compresses to action |
| DeBank / Zapper | Portfolio view | Monitoring-focused; ChainPilot is decision-focused |
| Nansen / Arkham | Wallet & entity intelligence | Intelligence layer; ChainPilot is operator workflow |

**Our moat is not raw data — it's the decision layer**: source-aware prioritization, method-aware comparisons, and safe workflow design.

---

## Project Structure

```
chainpilot/
├── src/
│   ├── index.ts              # Main orchestrator (4-phase cycle)
│   ├── config.ts             # Chains, guardrails, RPCs, yield tokens
│   ├── intel/
│   │   ├── defillama.ts      # TVL + DEX volume (5-chain parallel)
│   │   ├── lifi-scanner.ts   # Bridge routes + token prices
│   │   ├── signal.ts         # Signal aggregation → ChainSignal[]
│   │   └── yield.ts          # Ethena + Aave APY (on-chain reads)
│   ├── main/
│   │   ├── allocator.ts      # Risk-adjusted allocation engine
│   │   ├── guardrails.ts     # Hard rule enforcement (BigInt precision)
│   │   └── reporter.ts       # Telegram notification formatter
│   ├── sentinel/
│   │   ├── monitor.ts        # TVL drop / depeg / pause detection
│   │   └── evacuate.ts       # Emergency withdrawal logic
│   ├── lifi/
│   │   ├── client.ts         # LI.FI API wrapper (5 endpoints)
│   │   └── types.ts          # TypeScript types for LI.FI responses
│   └── wallet/
│       ├── signer.ts         # ethers.js wallet + ERC20 approve + broadcast
│       └── tracker.ts        # Cross-chain tx tracking (Mayan fallback)
├── SPEC.md                   # Full specification
└── package.json
```

---

## Target Chains

Ethereum • Base • Arbitrum • Optimism • Polygon

---

## Decision Latency

| | Time |
|---|---|
| **ChainPilot** | ~42s (signal → recommendation) |
| **Manual workflow** | ~5+ minutes |

---

## Target Users

1. **Fund / treasury operators** — cross-chain yield optimization under constraints
2. **Active on-chain traders** — faster signal-to-action with safety rails
3. **DeFi power users** — automated rebalancing with full transparency

---

## Roadmap

| Phase | Focus |
|-------|-------|
| **Phase 1** (current) | Deterministic signals, guardrailed execution, visible provenance |
| **Phase 2** | LLM advisory layer (sentiment, governance), Nansen smart money signals |
| **Phase 3** | Team workflows, API/SDK, role-based access |

---

## Built With

🦎 Powered by [LI.FI](https://li.fi) — cross-chain bridge & swap infrastructure

Built by **Clawdia 🐾** for the [LI.FI Vibeathon 2026](https://www.bridgemind.ai/vibeathon)

---

## License

MIT
