# Task 14 implementation report

## Scope completed locally

- Replaced the lockfile-presence stub with a dependency-injectable clean-copy
  verifier that:
  - resolves `pnpm` from `PATH` and never checks a Node.js or pnpm version;
  - copies source into an exact OS `mkdtemp` root using a non-dereferencing
    `lstat`/`copyFile` walk, rejects source symlinks and performs a second
    destination symlink scan;
  - excludes Git directories and worktree-style `.git` files, dependency trees,
    build/cache output, logs, tarballs,
    local `.env*` files (while retaining `.env.example`) and prior evidence;
    the exclusion contract explicitly covers every generated directory in the
    repository ignore policy, including `.storybook-static`, `dist-worker`,
    `tmp`, `temp`, `logs` and local Docker volumes;
  - removes inherited `NODE_PATH` and sets `AGENTPAY_CLEAN_COPY=1` for children;
  - runs the frozen install, formatting, lint, typecheck, test and build commands
    in the required order;
  - bounds child output and execution time, immediately terminates the full Unix
    process group with `SIGKILL`, uses bounded `taskkill /T /F` on Windows,
    reports only sanitized exit/signal/timeout classification and cleans only
    its exact temporary root in `finally`;
  - launches Windows `.cmd`/`.bat` pnpm shims through a fixed `ComSpec /d /s /c`
    command shape without enabling `shell: true`.
- Replaced the former two lockfile stub tests with behavioral clean-copy tests,
  including a real undeclared-package import which succeeds in the original
  fixture and fails after a real frozen install in the copy. Additional tests
  prove PATH-based pnpm resolution, current-Node recursion-marker behavior,
  symlink rejection, exact cleanup, bounded subprocess termination and
  sanitized exit/timeout classification. The timeout regression specifically
  uses a parent that exits on `SIGTERM` and a descendant that ignores it.
- Strengthened the migration guard to assert the exact lockfile importer set:
  root plus the five current workspaces.
- Added a current-architecture sensitive-material test for PEM/private-key
  material, credential assignments, non-dummy WalletConnect URIs and raw payment
  header values. Generated dependencies/output, migration plans and prior
  evidence are deliberately outside its scan scope; narrowly named dummy URI
  constants in tests remain allowed. Representative generated credentials are
  assembled at runtime so the scanner itself is tested without committing a
  raw credential fixture, and Windows-style paths are covered.
  The traversal itself is injectable and tested against a temporary retained
  `.env.example`; shell scripts and explicit extensionless config names are
  included in the repository scan.
- Added root pre-lifecycle builds for `@agentpaykit/server` so clean lint,
  typecheck, tests and builds cannot accidentally resolve its pre-existing
  `dist` directory from the original checkout.
- Extended formatting coverage to `.mjs`/`.mts`; formatted the existing
  `packages/tsconfig/scripts/validate.mjs` accordingly.
- Retained the four root `pre*` server builds noted as a review Minor. They are
  intentionally repetitive so each documented standalone lifecycle command
  remains valid in a clean checkout; replacing them with install-time mutation
  or source exports would weaken that contract.

## TDD and verification evidence

- RED: the new clean-copy suite initially had four failures against the old
  lockfile-only verifier (command contract, dependency isolation, symlink
  rejection and sanitized failure propagation).
- Review RED: strengthened regressions reproduced three defects: a copied
  worktree gitfile, child output present in an exported runner error, and a
  `SIGTERM`-ignoring descendant that survived timeout and wrote its sentinel.
- Review GREEN: focused clean-install/no-legacy/sensitive tests passed 3 files /
  74 tests; the final repository suite passed 7 files / 86 tests.
- The undeclared-dependency behavioral test performed a real frozen fixture
  install and failed only at the copied fixture's `pnpm test`, as intended.
- `git diff --check` passed.
- Installed toolchain observed (report-only, not constrained by repository):
  Node.js `v24.14.0`; pnpm `11.7.0`.

The first full verification exposed an existing `.mjs` formatting omission;
that file and the formatter scope were corrected. A later run exposed that the
original checkout's prebuilt `packages/server/dist` had masked a clean-copy
workspace build-order dependency; root pre-lifecycle server builds corrected
that dependency.

After all review fixes, a fresh `pnpm verify` on the exact final tree completed
with exit code zero. Its clean copy passed, in order: frozen install, format,
lint, typecheck, all workspace tests, 102 repository/integration tests and all
five workspace builds (including the Next.js route build). The host checkout
then passed the same format, lint, typecheck, test and build stages. A separate
final offline frozen install also passed.

Therefore the **local/reproducible portion of Gate F is green** under the
observed current toolchain. This does not satisfy either live-network gate.
The canonical MVP definition-of-done checklist now records the clean
verification and final scan as complete while keeping both live-network gates
and final independent review unchecked. A repository documentation test
enforces that status and the top-level **not ready for release** declaration.
The status regression was RED against the stale checklist, then passed 9/9
focused documentation assertions and the complete 87-test repository suite
after the checklist correction. Final independent review remains unchecked
until the follow-up review approves this change.

## Final scan classification

- Secret-keyword scan: 25 matches, all in deliberate policy/runbook prose,
  source header names, scanner patterns, or tests that assert sensitive data is
  absent/redacted.
  The repository behavioral sensitive-material test independently passed.
- Legacy-architecture scan: 28 matches, all in migration design/plan history or
  negative absence tests. No current README, quickstart, workspace metadata or
  live implementation instruction retains the old architecture.
- No sensitive values were copied into this report.

## Manual Gate F blockers

The local/reproducible portion of Gate F is green. The Base Sepolia and Base
Mainnet gates remain pending:

- Sepolia needs a deployed endpoint, funded test wallet, live MetaMask Mobile
  session and separate human confirmations for success and rejection/failure
  cases.
- Mainnet is blocked until reviewed Sepolia evidence exists, then needs one
  separately human-confirmed funded `0.01 USDC` call.

No Sepolia/Mainnet evidence file, transaction hash, balance delta or passed
status was created or simulated. The MVP is not yet release-ready.
