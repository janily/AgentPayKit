# AgentPayKit

AgentPayKit is a paid-skill runtime and local wallet bridge for Codex and Claude Code. It is being adapted from the pinned open-source `superposition/paybot` repository while preserving its MIT license and Git history.

The new architecture replaces the upstream prototype payment stack with:

- the official x402 v2 SDK and Base USDC;
- a Cloudflare Workers/Hono runtime with asynchronous execution;
- a shared macOS client and CLI;
- a loopback-only Browser Bridge for explicit MetaMask approval;
- deterministic publisher and installer tooling for both coding agents.

## Repository layout

```text
apps/runtime                  Cloudflare Worker entry point
packages/browser-bridge      Local payment approval UI
packages/protocol            Signed cross-boundary contracts
packages/payment             Official x402 adapter
packages/runtime             Runtime state and execution services
packages/client              Shared macOS client
packages/cli                 agentpay command line interface
packages/publisher           Release and package tooling
packages/installer           Dual-agent installer
packages/observability       Allowlisted logs and aggregates
packages/testkit             Deterministic payment fixtures
```

## Toolchain

Node.js 22 and pnpm 9.15.9 are pinned. With Corepack enabled:

```bash
pnpm install --frozen-lockfile
pnpm verify
```

The default test suite never broadcasts a transaction. Real Base Sepolia and Mainnet gates require explicit environment flags and isolated wallets.

## Development plan

The ordered M0–M7 implementation plans are indexed in [`docs/00-plan-index.md`](docs/00-plan-index.md). Upstream provenance and the exact adaptation boundary are recorded in [`docs/upstream/paybot-baseline.md`](docs/upstream/paybot-baseline.md).

## License

The original MIT license is preserved in [`LICENSE`](LICENSE).
