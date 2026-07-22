# Task 13 implementation report

## RED evidence

Command:

```text
pnpm exec vitest run tests/repository/docs-scope.test.ts
```

Result: expected failure, 1 test file failed and all 7 tests failed. The new
publisher, consumer, architecture, and network-gate documents did not exist;
the README still described the removed asynchronous architecture; and CI was
missing a package-manager setup step required by the original plan. Review then
corrected that plan requirement based on the real global-install behavior
described below.

## Implementation

- Replaced the repository landing page with the implemented developer-only
  publisher and consumer promises and explicit deferred scope.
- Added publisher and consumer quickstarts, a five-workspace/two-request
  architecture guide, and redaction-safe manual Base Sepolia/Mainnet runbooks.
- Replaced the obsolete M0–M7 evidence map with Gates A–F and distinguished
  automated evidence from the still-pending live-network gates.
- Updated the execution index to hand off from completed Tasks 1–13 to current
  Task 14 while keeping Gate F pending.
- Kept `npm install --global pnpm@latest` as CI's sole unpinned pnpm installation
  mechanism.
- Added an executable signed-business-failure gate using a unique GitHub URL
  confirmed `404` immediately before the call, with the internal, consumer and
  chain expectations stated separately.

No live-network gate was run and no live evidence file was created.

## Review correction RED evidence

After review, the scope tests were strengthened and run before the correction.
Three tests failed as expected: CI still enabled a conflicting package-manager
shim, the Sepolia runbook had no reproducible business-failure command, and the
index still named Task 13 as current. The CI correction follows reproduced
`EEXIST` behavior and the fact that current Node.js releases need not bundle the
shim manager; it preserves the user's current-stable, no-version-pin intent.

## GREEN evidence

```text
pnpm install --frozen-lockfile --offline --store-dir /tmp/agentpaykit-pnpm-store
  PASS (all 6 workspace projects already up to date)

pnpm exec vitest run tests/repository/docs-scope.test.ts tests/repository
  PASS (6 files, 72 tests)

pnpm format:check
  PASS

pnpm verify
  PASS (format, lint, typecheck, 70 server tests, 56 example tests,
  30 scaffolder tests, 131 CLI tests, 88 integration/repository tests, builds)

git diff --check
  PASS
```

## Remaining gates

Task 14 still owns final reproducibility validation and the opt-in, human-run
Sepolia/Mainnet release gates. `PAYMENT_STATE_UNKNOWN` remains a hard stop with
no automatic retry.
