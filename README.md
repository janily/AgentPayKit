# AgentPayKit

AgentPayKit is a developer-only MVP for publishing and calling synchronous,
x402-paid Skills.

> **Publish:** scaffold → edit `agentpay.skill.ts` → `pnpm deploy`
>
> **Use:** ask your Agent → review the quoted price → confirm in MetaMask →
> receive the result and receipt

Each Endpoint has one fixed USDC price. Publishers get an officially supported
Next.js App Router + Vercel path, while consumers use the `agentpay` CLI and
MetaMask Mobile. No-code publishing and browser consumer flows are deferred.

## Start here

- [Publisher quickstart](docs/publisher-quickstart.md)
- [Consumer quickstart](docs/consumer-quickstart.md)
- [Architecture and trust boundaries](docs/architecture.md)
- [MVP definition of done](docs/acceptance/mvp-dod.md)

The repository includes a deterministic
[`paid-repo-review`](examples/paid-repo-review) example. It supports official
x402 v2 `exact` payments in Base Sepolia and Base Mainnet USDC, with synchronous
business execution capped at 45 seconds.

## Repository layout

```text
packages/create-agentpay-skill  Next.js Skill project scaffolder
packages/server                 Thin official x402 Next.js wrapper
packages/cli                    Consumer CLI and MetaMask connection
packages/tsconfig               Shared TypeScript configuration
examples/paid-repo-review       End-to-end example Skill
```

## Develop the repository

Use the current stable Node.js and pnpm releases. The project does not pin an
exact version of either tool.

```bash
npm install --global pnpm@latest
pnpm install --frozen-lockfile
pnpm verify
```

Automated tests never open a wallet or broadcast a transaction. Live Base
Sepolia and Mainnet checks are separate, manual release gates.

## Product boundary

The compatible server contract settles only after a successful, valid result.
The CLI validates the quote before wallet access, but it cannot
cryptographically force a malicious seller to provide a useful result or honor
failure-no-charge. Use only endpoints you trust.

Hosted execution, dynamic/token/time pricing, asynchronous jobs, subscriptions,
a registry or store, automatic payment recovery, no-code creation, and browser
or React consumption are outside this MVP.

## License

The original MIT license and upstream ancestry are preserved. See
[`LICENSE`](LICENSE) and the [provenance record](docs/upstream/paybot-baseline.md).
