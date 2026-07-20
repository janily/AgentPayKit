# AgentPayKit MVP Definition of Done Evidence Map

Status: **not ready for release**. Automated local gates pass only after the final verification run; real Base Sepolia, dual-Agent Base Mainnet, and independent 30-minute installation remain mandatory external gates.

## M0 — provenance and reproducible baseline

- [x] Pinned upstream ancestry and MIT license: `tests/repository/provenance.test.ts`, `docs/upstream/paybot-baseline.md`.
- [x] Node 22 / pnpm 9.15.9 / no Bun lock: `tests/repository/toolchain.test.ts`, `.node-version`, `package.json`.
- [x] Repeatable clean-build guard and CI command chain: `tests/repository/assert-clean-build.test.ts`, `scripts/assert-clean-build.mjs`, `.github/workflows/ci.yml`.
- [x] Current ancestry command is included in the final verification checklist.

## M1 — remove the legacy PayBot payment stack

- [x] Browser Bridge retains payment metadata UI and never renders raw input: `packages/browser-bridge/src/App.test.tsx`, `PaymentModal.test.tsx`.
- [x] Production source/manifests reject QUSD, Escrow, Hardhat, custom facilitator and legacy headers: `tests/security/no-legacy-paybot.test.ts`.
- [x] Ten target package boundaries and acyclic workspaces: `tests/repository/workspaces.test.ts`, `tests/repository/toolchain.test.ts`.
- [x] Build-only smoke path: `e2e-test.sh`.

## M2 — official x402 and Workers compatibility

- [x] Official x402 verify and settle remain separate: `packages/payment/test/x402-payment-adapter.test.ts`.
- [x] Supported Base networks, decimal amounts and exact x402 `2.19.0` versions: `packages/payment/test/config.test.ts`, lockfile.
- [x] Worker compatibility/build: `apps/runtime/test/worker-compat.test.ts`, Wrangler dry-run build.
- [ ] Real Base Sepolia `0.01` USDC receipt and payee delta: pending `artifacts/e2e-sepolia.json`.
- [x] The M2-only synchronous spike route is absent after M3: `tests/e2e/x402-sepolia-spike.test.ts` is retained only as an opt-in historical compatibility gate; production routes are asynchronous.

## M3 — asynchronous execution and delayed settlement

- [x] `202` never settles synchronously: `apps/runtime/test/invocations-route.test.ts`.
- [x] Handler/Policy failure settles and transfers zero: `packages/runtime/test/queue-consumer.test.ts`, simulated scenarios.
- [x] Concurrent delivery executes and settles once; fingerprint conflict is rejected: queue consumer and invocation service tests.
- [x] Unknown settlement recovers from receipt/event without a new signature: reconciliation/recovery tests and `settle-recovery` scenario.
- [x] Candidate result stays hidden before settlement; retention cleanup is tested: result route and cleanup tests.

## M4 — Client, budgets and local wallet Bridge

- [x] Fake Runtime invoke/resume flow and signed Runtime responses: Client and Browser Bridge tests.
- [x] Non-macOS fails before Bridge/network access: CLI and Bridge tests.
- [x] Concurrent budget reservations cannot overspend: `packages/client/test/budget.test.ts`.
- [x] Replay, CSRF, Origin/Host, TTL and close cleanup: Bridge server/session tests plus `tests/security/bridge-csrf.test.ts`.
- [x] Secret/log/input scans: `tests/security/secret-scan.test.ts`, `log-leak.test.ts`, `bundle-scan.test.ts`.

## M5 — publisher, immutable package and dual-Agent installer

- [x] Empty-directory scaffold test/build and frozen lockfile: Publisher scaffold tests.
- [x] Package/Release tamper rejects before installation writes: Publisher/installer tests and `package-tamper.test.ts`.
- [x] One install creates one shared Client and Codex/Claude Code entries: installer and dual-agent integration tests.
- [x] Idempotence, rollback and user-file preservation: installer tests.
- [x] Separate testnet/mainnet Release IDs and auditable payment terms: release tests and `docs/acceptance/m6-example.md`.
- [x] Installed `.apkg` is directly loadable and verified against its EIP-191 Release and delegated Runtime: Client/CLI package-loading tests.

## M6 — Deep Research Lite and observability

- [x] Page/token/time/cost/provider/retry caps: example Handler tests.
- [x] Policy rejection never settles: example success-policy tests.
- [x] Allowlisted logs leak zero private fields: observability and security scans.
- [x] Stable spend/receipts/PayInsight JSON and separated data domains: CLI/observability tests.
- [x] Deterministic testnet/mainnet example packages have distinct Release IDs: example package tests and acceptance snapshot.

## M7 — release evidence

- [x] Simulated twelve-scenario report is `passed=12`, `failed=0`: `artifacts/e2e-simulated.json` and scenario tests.
- [x] Security and dual-Agent install report is `failed=0`: `artifacts/security-gates.json` and eight gate tests.
- [ ] Real Base Sepolia twelve-scenario report is `passed=12`, `failed=0`: pending external gate.
- [ ] Codex and Claude Code each complete one independently confirmed Base Mainnet `0.01` USDC call: pending `docs/acceptance/m7-mainnet.json`.
- [ ] Independent macOS tester completes install, both Agent calls, recovery and uninstall within 30 minutes: pending `third-party-script.md` result record.
- [ ] Signed release commit/tag and independent code/security review have no blocking findings: pending final release ceremony.
- [x] Six global verification commands exit `0` on the current candidate tree: `artifacts/release-evidence.json` records the 2026-07-20 verification run.

Any unchecked item blocks the release. Local test success cannot substitute for a chain transaction or human acceptance record.
