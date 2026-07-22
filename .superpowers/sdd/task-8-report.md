# Task 8 report: CLI quote validation before wallet access

## TDD evidence

The amount and challenge tests were created before any production module. The
required workspace command could not enter Vitest because the environment's
pnpm launcher attempted to create `/root/.local`, which is outside the writable
sandbox. Running the same CLI workspace's existing Vitest binary directly
provided the required RED evidence:

```bash
cd packages/cli
./node_modules/.bin/vitest run amount.test.ts challenge.test.ts
```

RED result: both suites failed to load their missing production imports:

```text
Failed to load url ../src/amount
Failed to load url ../src/challenge
```

No production Task 8 module existed at that point.

After implementation, the focused behavior passed with 36 tests across the two
new test files. The complete CLI suite passed 53 tests across seven files.

## Rejection matrix

Every rejection invokes an external test-only `createWallet` sentinel zero
times. Production challenge validation has no wallet dependency or injection
point.

| Challenge condition                       | Error code                            |
| ----------------------------------------- | ------------------------------------- |
| Malformed header                          | `INVALID_PAYMENT_REQUIRED`            |
| x402 version other than 2                 | `INVALID_PAYMENT_REQUIRED`            |
| Resource URL mismatch or malformed URL    | `INVALID_PAYMENT_REQUIRED`            |
| Scheme other than `exact`                 | `UNSUPPORTED_PAYMENT_REQUIREMENT`     |
| Unsupported network                       | `UNSUPPORTED_PAYMENT_REQUIREMENT`     |
| Asset other than official network USDC    | `UNSUPPORTED_PAYMENT_REQUIREMENT`     |
| Zero or non-integer atomic amount         | `INVALID_PAYMENT_REQUIRED`            |
| Zero or invalid payee                     | `INVALID_PAYMENT_REQUIRED`            |
| Unique valid amount above the user maximum | `PRICE_EXCEEDS_MAXIMUM`               |
| No acceptable candidate                   | `UNSUPPORTED_PAYMENT_REQUIREMENT`     |
| More than one acceptable candidate        | `INVALID_PAYMENT_REQUIRED`            |

Unsupported alternatives are ignored only when exactly one supported candidate
remains. Two supported candidates are rejected before price selection so the
CLI never silently chooses among ambiguous payment terms.

## APIs and implementation

- `parseMaxPrice(value: string): bigint` accepts positive canonical USDC
  decimals with at most six fractional places and performs all conversion with
  `bigint`.
- `NETWORKS` exposes the exact Base Sepolia and Base network constants from the
  plan.
- `USDC_ASSETS` resolves both addresses through x402 2.19.0
  `getDefaultAsset`; no production USDC address literal is duplicated.
- `selectPaymentRequirement({ header, endpoint, maxPrice })` decodes through
  `decodePaymentRequiredHeader`, compares canonical URL `href` values exactly,
  validates and compares EVM addresses with viem, selects exactly one supported
  requirement, and compares atomic amounts as `bigint`.
- `SelectedRequirement` contains `network`, the exact challenge `asset`, atomic
  `amount`, exact challenge `payTo`, canonical `resourceUrl`, and the decoded
  `paymentRequired` object.

## Dependency and file changes

- Added exact direct CLI dependencies `@x402/core@2.19.0`,
  `@x402/evm@2.19.0`, and `@types/node@24.13.3`; retained the existing exact
  `viem@2.55.2` dependency.
- Added `packages/cli/src/amount.ts`.
- Added `packages/cli/src/challenge.ts`.
- Added `packages/cli/src/networks.ts`.
- Added `packages/cli/test/amount.test.ts`.
- Added `packages/cli/test/challenge.test.ts`.
- Updated `packages/cli/package.json` and `pnpm-lock.yaml`.

The exact Node types dependency is required by the shared Node tsconfig under a
strict pnpm dependency layout; without it, the CLI typecheck reported missing
type definition file `node`.

## Verification

```text
pnpm install --frozen-lockfile --offline --store-dir /tmp/agentpaykit-pnpm-store  PASS
pnpm --filter @agentpaykit/cli test                                             PASS (53 tests)
pnpm --filter @agentpaykit/cli typecheck                                        PASS
pnpm --filter @agentpaykit/cli build                                            PASS
pnpm format:check                                                               PASS
git diff --check                                                                PASS
exact dependency-version check                                                  PASS
no wallet/MetaMask/createWallet import or reference in Task 8 production files  PASS
no handwritten 40-byte asset address in networks/challenge production files     PASS
```

The existing CLI release test emits Node's experimental SQLite warning; it does
not fail the suite.

## Commit

Task commit message: `feat(cli): validate fixed x402 quote before wallet`.

## Self-review and concerns

- Challenge validation completes before the test-only wallet sentinel is
  reached in every failure case.
- `challenge.ts` imports only official x402 decoding, viem validation, and the
  local network metadata module; it has no wallet import or wallet call.
- Returned asset and payee strings preserve the decoded challenge values after
  viem semantic equality checks rather than silently rewriting payment terms.
- Existing CLI source and legacy tests were not rewritten; the full legacy CLI
  suite remains green.
- Default CI does not connect, sign, broadcast, or access a network.
- No known correctness concern remains. The pnpm wrapper's unwritable default
  home was worked around with temporary HOME/XDG/PNPM paths and the existing
  `/tmp` package store; this is an execution-environment limitation only.

## Review hardening follow-up

Review identified that malformed `accepts` siblings were ignored when another
candidate was valid and that attacker-controlled atomic strings reached
`BigInt` without a lexical bound. Regression tests were added before changing
production code.

The follow-up RED run produced 15 expected failures:

- valid candidates were accepted alongside `null`, `{}`, arrays, non-string
  fields, invalid address syntax, malformed amounts, and malformed payees;
- a malformed sibling did not take precedence over the over-limit error;
- uint256 overflow and a 100,000-digit atomic string reached the old selection
  path;
- direct `maxPrice` values of `0n`, `-1n`, and uint256 plus one were accepted or
  misclassified; and
- max-price decimal conversion accepted uint256 overflow and an unbounded
  lexical whole part.

The hardened implementation now validates every `accepts` entry before
selection. Any malformed entry makes the complete challenge
`INVALID_PAYMENT_REQUIRED`, before ambiguity or price evaluation. Well-formed
unsupported schemes and networks, plus syntactically valid non-official asset
addresses, remain unsupported alternatives and can coexist with one acceptable
candidate.

Atomic requirement values are limited to 78 decimal digits and then checked
against `2^256 - 1`. The huge-digit regression spies on `BigInt` and proves the
conversion is never called. `parseMaxPrice` rejects oversized whole parts
before conversion and rejects a computed atomic value above uint256. Direct
selection requires `maxPrice` in `1..2^256-1`; invalid values use the existing
allowed `INVALID_PAYMENT_REQUIRED` surface.

Follow-up GREEN and verification:

```text
focused amount/challenge suite  PASS (53 tests)
full CLI suite                  PASS (70 tests)
CLI typecheck                   PASS
CLI build                       PASS
frozen offline install          PASS
root format check               PASS
diff/static boundary checks     PASS
```

Follow-up commit message:
`fix(cli): reject malformed payment alternatives`.
