# AgentPayKit developer-first MVP — execution index

## Current baseline

- Publisher: scaffold → edit `agentpay.skill.ts` → run one `pnpm deploy`.
- Consumer: ask the Agent → inspect quote → confirm each call in MetaMask →
  receive result and receipt.
- Payment: one fixed USDC price per Endpoint through official x402 v2.
- Execution: synchronous Next.js App Router on Vercel, business work at most 45
  seconds.
- Scope: developers only; no-code and browser flows are deferred.

## Authoritative documents

| Document                                                                                              | Purpose                                                 | Status                               |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------ |
| [Synchronous MVP design](superpowers/specs/2026-07-20-synchronous-paid-skill-mvp-design.md)           | Product, architecture, security and acceptance baseline | Approved                             |
| [Developer-first implementation plan](superpowers/plans/2026-07-21-developer-first-paid-skill-mvp.md) | Ordered file-level migration plan                       | Tasks 1–13 complete; Task 14 current |
| [Publisher quickstart](publisher-quickstart.md)                                                       | Supported scaffold/config/deploy journey                | Current                              |
| [Consumer quickstart](consumer-quickstart.md)                                                         | CLI and MetaMask per-call journey                       | Current                              |
| [MVP definition of done](acceptance/mvp-dod.md)                                                       | Gates A–F and evidence state                            | Gate F pending                       |

## Execution state

| Gate                    | Tasks | State       | Outcome                                                                       |
| ----------------------- | ----: | ----------- | ----------------------------------------------------------------------------- |
| A — Publisher core      |   1–4 | Complete    | Single config, generated instructions, success-only official x402 handler     |
| B — One-command publish |   5–7 | Complete    | Safe scaffold, one Vercel deployment, deterministic example                   |
| C — Consumer core       |  8–10 | Complete    | Strict quote checks, MetaMask confirmation, two-request CLI                   |
| D — Vertical slice      |    11 | Complete    | Success settles once; defined failures settle zero times                      |
| E — Migration           |    12 | Complete    | Live tree reduced to the five synchronous workspaces                          |
| F — Release             | 13–14 | In progress | Documentation/CI, reproducible build, manual Sepolia, then controlled Mainnet |

The earlier asynchronous implementation is migration history, preserved by Git
history and the `legacy-async-mvp` tag. It is not a current implementation path.
Task 14 performs final reproducibility checks. Base Sepolia and Mainnet release
gates remain manual and pending until redacted evidence is actually collected.
