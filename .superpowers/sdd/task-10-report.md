# Task 10 implementation report

## RED

- Added the bounded two-request HTTP state table before production code.
- Expected failure: `packages/cli/src/call.ts` did not exist.
- Observed: the focused run failed with a module-resolution error for exactly
  that missing file while the 85 pre-existing CLI tests passed.
- Later RED refinements covered mismatched payer/network/amount/transaction,
  oversized and chunked bodies, malformed JSON/content types, a response stream
  that outlives the signed timeout, redirects, duplicate/unknown flags, cleanup
  errors, and the removal of legacy commands.

## Implementation decisions

- `callPaidSkill` validates endpoint policy and the exact UTF-8 JSON body before
  fetching. It sends one unsigned POST, accepts a bounded JSON 2xx free result,
  or validates exactly one x402 v2 challenge before invoking wallet code.
- The paid path emits only a sanitized payment summary, waits up to five minutes
  for a MetaMask session, creates one official x402 signature, and sends exactly
  one signed POST. Redirects are manual and no request is retried.
- The user-selected 1..60 second signed-request timer stays active through the
  entire streamed body read. Bodies are capped at 1 MiB; the timer aborts the
  request and cancels an acquired stream before returning unknown settlement.
- `decodePaymentResponseHeader` from `@x402/core/http` is the only receipt
  decoder. Because it only base64-decodes and parses JSON, the CLI caps its input
  at 16 KiB and independently validates record shape, success, network, payer,
  nonzero 32-byte transaction hash, and optional atomic amount.
- Official `SettleResponse` has no `payTo` or asset field, and exact settlement
  commonly omits `amount`. The returned amount/payee therefore come from the one
  validated requirement that the official signer bound into the payment; the
  receipt must match network, payer, transaction, and amount when present.
- JSON output is reduced to the exact success/failure envelopes. Messages are
  stable codes, and unknown settlement human output explicitly prevents blind
  retry. No challenge, signature, QR URI, balance, or raw response is returned.
- `main.ts` exposes only `call`, `doctor`, and `wallet disconnect`, with strict
  duplicate/unknown option handling and no platform gate. Doctor accepts newer
  tools, initializes MetaMask without connecting/requesting accounts, and checks
  both Base RPCs with timeouts and bounded bodies. Disconnect does not connect or
  sign.
- The CLI build is cleaned before TypeScript emit and bundles only project code;
  external dependencies remain normal Node package imports. A real Linux bundle
  smoke test confirmed the new command surface.

## GREEN verification

- `pnpm --filter @agentpaykit/cli test` — 10 files, 117 tests passed.
- `pnpm --filter @agentpaykit/cli typecheck` — passed.
- `pnpm --filter @agentpaykit/cli build` — passed.
- `node packages/cli/dist/index.js invoke --json` — returned the exact sanitized
  `UNKNOWN_COMMAND` envelope on Linux.
- `pnpm install --frozen-lockfile --offline --store-dir
  /tmp/agentpaykit-pnpm-store` — passed with pnpm 11.7.0.
- `pnpm format:check` — passed.
- `git diff --check` — passed.
- Static searches found no legacy command imports/exports in the new entrypoint,
  no platform gate, and no logging/serialization of raw payment material.

## Concerns

- The official x402 settlement receipt cannot independently restate the payee or
  asset. Payee/USDC/quoted amount authenticity is instead inherited from strict
  challenge selection plus the official signer binding; receipt fields are
  validated fail-closed wherever the SDK actually provides them.
- Legacy CLI source files remain physically in the repository for Task 13, but
  they are excluded from TypeScript production emit and are neither imported,
  exported, nor retained as runtime dependencies by the executable package.

## Review remediation

The first task review found that the state machine itself was bounded, but the
clean-machine product path was not yet usable or publishable. Remediation was
implemented with new failing tests before each fix:

- The headless MetaMask `displayUri` now goes through the directly declared,
  exact `qrcode-terminal@0.12.0` production dependency. The default dependency
  callback renders a scannable terminal QR and never writes the raw
  WalletConnect URI; its renderer and writer are narrowly injectable for a
  production-callback test.
- `@agentpaykit/cli` is publishable, contains only public runtime dependencies,
  and uses a `files` allowlist for `dist`, package README, and MIT license. A
  pack test filters specifically for one `.tgz`, inspects every archive entry,
  installs it into an isolated directory using the offline pnpm store, and runs
  the installed bin. No private workspace package is resolved.
- Normal calls preserve the established MetaMask Connect session. Only the
  explicit `wallet disconnect` command revokes it. Rejection, success, and two
  consecutive paid-call tests assert zero per-call disconnects.
- A fixed five-minute outer deadline now covers connection plus the entire
  signing prompt. The signed HTTP timer still begins only after a signature is
  returned. Never-settling and late signature tests prove timeout is
  `not-charged` and a late completion cannot issue the second request.
- Officially encoded settlement-failure fixtures now exercise 2xx, 402, 5xx,
  and oversized bodies. Both receipt outcomes require a record, boolean
  `success`, bound network, string transaction, and bound optional amount/payer;
  success additionally requires the selected payer and nonzero transaction
  hash. Explicit failure maps to `SETTLEMENT_FAILED` / `not-charged`, while
  malformed or mismatched fields remain unknown without exposing facilitator
  messages.
- Direct-execution detection now compares the real executable path with
  `fileURLToPath(import.meta.url)` using platform-specific normalization. A
  Windows path/casing regression test complements the actual Linux installed
  bin smoke.

Remediation GREEN:

- `pnpm install --frozen-lockfile --offline --store-dir
  /tmp/agentpaykit-pnpm-store` — passed.
- `pnpm --filter @agentpaykit/cli test` — 11 files, 126 tests passed,
  including pack, isolated offline install, and installed-bin smoke.
- `pnpm --filter @agentpaykit/cli typecheck` — passed.
- `pnpm --filter @agentpaykit/cli build` — passed.
- `pnpm format:check` and `git diff --check` — passed.
- Static scans confirmed no legacy runtime dependency or command in the
  published manifest/tarball/entrypoint and no raw payment or WalletConnect URI
  logging path.

## Review v2 remediation

- The package smoke test no longer assumes a machine-specific `/tmp` store. It
  resolves the active versioned store with `pnpm store path --silent` under the
  same cwd and environment as packing/installing; when `PNPM_STORE_DIR` is
  explicitly supplied, it passes that configuration to the resolver. The
  isolated install remains strictly offline.
- Receipt validation now covers every known official `SettleResponse` field
  before trusting either outcome: required boolean `success`, string
  `transaction`, bound network, scalar optional payer/amount/error fields, and
  nullish or non-array-record extension/extra fields. Eight officially encoded
  adversarial fixtures cover malformed optional fields across success and
  failure receipts; every case remains settlement-unknown.
- The default payment summary and QR callbacks now write through the same
  injected stderr sink. Production-callback coverage confirms both allowed
  summaries reach that sink while the raw WalletConnect URI never does.

Review v2 GREEN:

- Full CLI suite with `PNPM_STORE_DIR` configured — 11 files, 134 tests passed,
  including isolated offline package install and installed-bin execution.
- Full CLI suite with `PNPM_STORE_DIR` unset and the active default pnpm store —
  11 files, 134 tests passed with the same package gate.
- Typecheck, build, frozen offline install, root formatting, diff check, and
  sensitive/legacy static scans passed in the final verification below.
