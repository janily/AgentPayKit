# AgentPayKit MVP definition of done

Status: **not ready for release**. Gates A–E have automated repository evidence.
Gate F's local/reproducible clean verification and final scan are complete.
Manual Base Sepolia evidence, Base Mainnet evidence, and final independent
review remain pending. Automated green tests do not prove a live transfer.

## Gate A — publisher core (Tasks 1–4)

- [x] One validated `agentpay.skill.ts` defines fixed USDC price, network,
      payee, schemas, example input, timeout, execution and success policy.
- [x] Skill instructions are deterministically generated from that config.
- [x] The Next.js handler composes official x402 v2 and settles only a valid,
      successful response in conformance tests.

## Gate B — one-command publishing (Tasks 5–7)

- [x] The scaffolder creates a complete, publish-safe Next.js App Router
      project without overwriting existing paths.
- [x] `pnpm deploy` performs preflight, exactly one Vercel production deployment,
      online quote verification, and final Skill instruction generation.
- [x] `examples/paid-repo-review` supplies a deterministic model-free vertical
      example with one fixed Base Sepolia price.

## Gate C — consumer core (Tasks 8–10)

- [x] `--max-price` and x402 challenge validation run before wallet access.
- [x] MetaMask Mobile connection validates the selected account, chain, balance,
      typed data, and requests a fresh signature for every payment.
- [x] The CLI implements one unsigned plus one signed request, bounded response
      handling, stable payment-state errors, and validated receipts.

## Gate D — local vertical slice (Task 11)

- [x] The real server and CLI parsers exercise success, rejection, business
      failure, timeout, malformed result, receipt loss, and replay boundaries.
- [x] Local success settles once; defined pre-settlement failures settle zero
      times. Sensitive payment material is absent from outputs.

## Gate E — migration (Task 12)

- [x] Only the five synchronous MVP workspaces remain.
- [x] The prior asynchronous execution and custom distribution implementation is
      absent from the live tree and preserved by Git history and the
      `legacy-async-mvp` tag.
- [x] Workspace metadata, tests, and lockfile no longer depend on that design.

## Gate F — release evidence (Tasks 13–14)

- [x] Developer publisher/consumer journeys, architecture, and manual gate
      runbooks reflect the implemented MVP.
- [x] CI uses current stable Node.js and pnpm and contains no wallet or live-chain
      secret.
- [x] A fresh final run of frozen clean installation, format, lint, typecheck,
      tests, and build passes on the release candidate.
- [ ] Manual Base Sepolia evidence records one successful transfer, one rejected
      payment with zero transfer, and one business failure with zero transfer.
- [ ] After Sepolia passes, one manually confirmed Base Mainnet `0.01 USDC` call
      records its receipt and exact payee delta.
- [x] Final secret and scope scan has no blocking findings.
- [ ] Final independent review has no blocking findings.

Follow the [Sepolia runbook](../runbooks/base-sepolia-mvp-gate.md) and only then
the [Mainnet runbook](../runbooks/base-mainnet-mvp-gate.md). Do not create live
evidence from simulated tests, and never convert the wallet confirmation steps
into automation. Any unchecked Gate F item blocks release.
