# Task 12 implementation report

## Deletion gate and RED

- Re-ran `pnpm test:new-mvp` before deletion: 4 files and 18 tests passed.
- Added `tests/repository/no-legacy-architecture.test.ts` before removing any
  source. Its first run failed 56 of 57 tests against the legacy paths,
  wildcard workspace declaration, old root test script and legacy lockfile
  importers.

## Removed architecture

Deleted the enumerated legacy workspace roots:

- `apps/runtime`
- `packages/runtime`, `packages/protocol`, `packages/payment`,
  `packages/client`, `packages/browser-bridge`, `packages/publisher`,
  `packages/installer`, `packages/observability`, and `packages/testkit`
- `examples/paid-deep-research-lite`

Deleted obsolete acceptance infrastructure:

- `tests/e2e`, `tests/legacy-async`, `tests/release`, `tests/security`, and
  `artifacts`
- `e2e-test.sh`, `scripts/e2e-sepolia.sh`, `scripts/mainnet-evidence.mjs`,
  `scripts/mainnet-preflight.mjs`, `scripts/mainnet-preflight.sh`, and
  `scripts/run-sepolia-spike.sh`
- milestone documents `docs/01-m0-*` through `docs/08-m7-*`
- old acceptance documents other than the retained `docs/acceptance/mvp-dod.md`
- all four old runbooks; Task 13 creates the two synchronous MVP runbooks

Deleted the legacy CLI implementation and tests:

- `src/bridge-assets.ts`
- `src/commands/{create,install,invoke,payinsight,receipts,release,resume,shared,spend,status,uninstall}.ts`
- `test/{load-skill,release,uninstall}.test.ts`

All source and repository file removals used explicit, path-by-path patches.
Ignored local build outputs and dependency links underneath the removed roots
were moved intact to `/tmp/agentpaykit-task12-generated-backup` so the deletion
guard could exercise the real filesystem without destructively removing local
caches.

## Workspace and toolchain orchestration

- `pnpm-workspace.yaml` now names exactly the five live projects.
- Rebuilt `pnpm-lock.yaml`; its importers are only root plus those five
  projects and it contains none of the deleted internal package names.
- Added meaningful `build`, `lint`, `test`, and `typecheck` scripts to the
  shared tsconfig project and filled missing lint scripts in the other live
  projects, so root orchestration cannot silently skip a project.
- Turbo 2.10.5 rejected the standard-looking versionless
  `devEngines.packageManager: { name: "pnpm" }` because it requires a version.
  Its bypass did not discover the workspace task graph without package-manager
  metadata. To honor the explicit no-version-pinning requirement, removed
  Turbo and use strict `pnpm -r run ...` root scripts. This is the necessary
  implementation deviation from the plan's sample Turbo scripts.
- No `packageManager`, `devEngines.packageManager`, `engines`, `.nvmrc`, or
  `.node-version` was added.

## Verification

- Current tools: Node.js `v24.14.0`, pnpm `11.7.0`.
- Frozen offline install passed with all 6 workspace projects (root plus five).
- Legacy removal guard: 58 passed.
- `pnpm test:new-mvp`: 18 passed.
- Repository tests: 64 passed.
- Root `pnpm lint` and `pnpm typecheck` each reported `Scope: 5 of 6 workspace
  projects` and executed all five project scripts successfully.
- Root `pnpm test`: server 70, scaffolder 30, CLI 131, example 56, tsconfig
  validation, plus 80 root integration/repository tests all passed.
- Root `pnpm build` executed all five projects; the Next.js production build
  completed and emitted `/api/invoke` as a dynamic route.
- `pnpm format:check` and `git diff --check` passed.
- Static scans found no deleted workspace importers or internal package names,
  no legacy Cloudflare dependencies, and no tool-version pin metadata.
