# Publisher quickstart

The supported MVP publishing path is a generated Next.js App Router project on
Vercel. AgentPayKit concerns stay in one file; your business implementation may
live in any modules imported by that file.

## Prerequisites

- current stable Node.js and pnpm releases;
- a Vercel account and authenticated Vercel CLI session;
- a public EVM address that receives USDC;
- any secrets required by your own business code, configured in Vercel rather
  than committed to the repository.

No private key, seed phrase, consumer wallet, or Infura account is needed to
publish.

## Three steps

```bash
# 1. Scaffold a complete paid Skill project
pnpm create agentpay-skill@alpha my-paid-skill

# 2. Set the payment terms, schemas and execute function
cd my-paid-skill
$EDITOR agentpay.skill.ts

# 3. Verify and create one Vercel production deployment
pnpm deploy
```

The scaffold owns the standard API route, official x402 integration, validation,
tests, deployment script, and generated Skill instructions. Keep
`app/api/invoke/route.ts` unchanged. You do not need to maintain those generated
parts by hand.

## Configure the Skill

`agentpay.skill.ts` is the single AgentPayKit configuration source. Update:

- `name` and `description`;
- one fixed decimal-string `price` in USDC;
- `network`: `base-sepolia` for this preview; Base Mainnet is out of scope;
- the public `payTo` address;
- `facilitatorUrl` (a production facilitator is required for Mainnet);
- `exampleInput`, input and output schemas, `execute`, and `success`.

The price must be greater than zero and have at most six decimal places. Input
and output are JSON. Business execution must finish within `timeoutMs`, which is
at most 45 seconds. `exampleInput` is validated and reused for deployment quote
verification and generated Skill instructions.

Start locally when developing:

```bash
pnpm dev
```

## What `pnpm deploy` does

The command validates the configuration, runs the project checks, invokes one
Vercel production deployment, captures its HTTPS origin, requests the deployed
Endpoint without payment, and validates the returned quote against the local
network, asset, amount, payee, and URL. Only then does it generate the final
`skill/SKILL.md` locally.

If any preflight or online quote check fails, publication fails closed. Vercel
authentication, project ownership, custom domains, business API credentials,
and selecting a trustworthy production Facilitator remain publisher
responsibilities.

## Existing Next.js projects

An existing Next.js App Router project can integrate the generated
`agentpay.skill.ts` and fixed Route Handler. The official one-config promise,
however, applies to the scaffolded project; other frameworks may use official
x402 SDKs directly but are outside this MVP support boundary.

Before release, follow the manual [Base Sepolia gate](runbooks/base-sepolia-mvp-gate.md).
Base Mainnet remains out of scope for the community preview.
