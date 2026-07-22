# Task 7 report: paid repository review

## Scaffold proof

The example was created from the scaffold CLI, rather than copied from its
template:

```bash
pnpm --filter create-agentpay-skill build
node packages/create-agentpay-skill/dist/cli.js paid-repo-review --cwd examples
```

The CLI printed:

```text
Created /workspace/scratch/13b3253b1d9d/agentpaykit-review/examples/paid-repo-review
```

The resulting directory had the complete 17-file scaffold tree before
review-specific changes were made.

## TDD evidence

The required initial workspace command returned no matching workspace because
the example did not yet exist. After generation, `test/review-repository.test.ts`
was written before replacing the starter implementation.

RED command:

```bash
pnpm --filter paid-repo-review test -- test/review-repository.test.ts
```

RED result: 17 tests failed against the generated starter. Failures covered
unsafe URL acceptance, absent GitHub calls, missing authorization-header
behavior, untyped 404/rate-limit/JSON failures, and abort handling.

GREEN command:

```bash
pnpm --filter paid-repo-review test
```

GREEN result before the dependency-tree outage: 37 tests passed across 4 test
files. The suite includes URL/SSRF constraints, the four allowed GitHub calls,
typed upstream errors, abort behavior, server non-2xx conversion, and rendered
`SKILL.md` parity.

## Implementation

- `src/github.ts` strictly accepts only `https://github.com/<owner>/<repo>`.
  It rejects credentials, query/hash values, ports, private IPs, non-GitHub
  hosts, trailing or extra path segments, and unsafe owner/repository tokens.
- It makes only deterministic calls to `https://api.github.com` for repository
  metadata, languages, README presence, and five recent commits.
- `RepositoryReviewError` provides typed invalid URL, 404, rate-limit, abort,
  invalid-JSON, and generic-upstream failures. The existing paid-skill executor
  converts these upstream errors to its non-2xx `EXECUTION_FAILED` response.
- `GITHUB_TOKEN`, when present, is used only in an Authorization header. It is
  not copied into output, log statements, tests, or `SKILL.md`.
- The config uses Base Sepolia, the official
  `https://x402.org/facilitator`, price `0.01`, the non-zero burn address, and
  a schema-valid `exampleInput`.
- `skills/paid-repo-review/SKILL.md` is asserted equal to the server renderer
  for `https://paid-repo-review.vercel.app`.

## Source integration fix

The generated four-line route initially failed `next build` because the linked
`@agentpaykit/server` package resolved Next's React peer as React 18 while the
scaffold requires React 19. The example route was restored exactly to scaffold
output. `packages/server/package.json` now declares exact React 19.2.7,
react-dom 19.2.7, and matching type packages as dev peer-support dependencies
so the package resolves the same Next request type as consumers.

## Final verification

After restoring the dependency environment and regenerating the lockfile:

```text
pnpm install --frozen-lockfile --store-dir /tmp/agentpaykit-pnpm-store  PASS
pnpm --filter @agentpaykit/server test                                        PASS (70 tests)
pnpm --filter @agentpaykit/server typecheck                                   PASS
pnpm --filter @agentpaykit/server build                                       PASS
pnpm --filter create-agentpay-skill test                                      PASS (30 tests)
pnpm --filter create-agentpay-skill typecheck                                 PASS
pnpm --filter create-agentpay-skill build                                     PASS
pnpm --filter paid-repo-review test                                           PASS (37 tests)
pnpm --filter paid-repo-review typecheck                                      PASS
pnpm --filter paid-repo-review build                                          PASS
```

The four-line example route is byte-for-byte identical to the scaffold route.
Targeted Prettier checking, `git diff --check`, and static token/host scans also
pass. The root `pnpm format:check` also passes after ephemeral SDD material was
added to the tracked Prettier ignore list.

## Hardening follow-up

Review findings were addressed test-first in commit follow-up work. The new RED
suite recorded 14 failures: raw empty query/hash, an explicit default port,
case-normalized URLs, missing redirect refusal, mid-body aborts, and malformed
but parseable metadata/language/commit payloads all crossed the old boundary.

The GitHub adapter now requires the raw anchored literal
`https://github.com/<safe-owner>/<safe-repo>` before URL parsing, refuses fetch
redirects, detects aborts while JSON bodies are parsed, validates exact metadata
and language types, and accepts only canonical GitHub `YYYY-MM-DDTHH:mm:ssZ`
commit timestamps while returning deterministic `YYYY-MM-DD` days. The updated
GREEN suite has 56 example tests. A malformed metadata execution is also
asserted to become the existing paid executor's 502 non-success outcome.

## Vercel policy adjustment

`vercel` 56.4.1 was rejected by the repository's minimum-release-age policy.
The exact direct dependency in the scaffold template and generated example was
changed to the policy-safe 56.3.2; the design and plan version tables were
updated to match. `linkWorkspacePackages: true` was also added to the pnpm
workspace configuration so the example's exact `@agentpaykit/server` 0.1.0
dependency resolves to the local workspace during repository verification.

## Changed files

- `packages/server/package.json`
- `packages/create-agentpay-skill/template/package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- the MVP plan and design version tables
- `examples/paid-repo-review/`
- `skills/paid-repo-review/SKILL.md`
- `.superpowers/sdd/task-7-report.md`

## Self-review

- Kept `examples/paid-deep-research-lite` untouched.
- Confirmed no model API calls, private host requests, token output, or token
  documentation are present in the new business implementation.
- Confirmed the only business-fetch origin is the fixed GitHub API origin.
