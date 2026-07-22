# Task 9 implementation report

## RED

- Added focused MetaMask connection and x402 signer adapter tests before production modules.
- Expected failure: `packages/cli/src/metamask.ts` and `packages/cli/src/signer.ts` do not exist yet.
- Observed: 2 failed suites with module-resolution errors for exactly those files; 70 pre-existing tests passed.

An additional security-hardening RED cycle covered late client initialization and
connection error sanitization. Both tests initially failed: a late client was not
disconnected and the raw connection error was exposed.

## Implementation decisions

- The production default invokes `createEVMClient` from
  `@metamask/connect-evm@2.1.1`; a narrow injected factory keeps tests
  deterministic without weakening the production path.
- MetaMask Connect runs headless with analytics and provider auto-announcement
  disabled. Only `displayUri` reaches the injected renderer.
- Account selection prefers the provider's selected account only when it is in
  the current `connect()` result, otherwise it uses the result's documented
  selected first account. Wrong/missing current state aborts.
- Timeout covers initialization plus wallet connection. A client that resolves
  after expiry is disconnected, and raw SDK errors are mapped to stable codes.
- The EIP-1193 adapter uses viem for `balanceOf` and implements the official
  `ClientEvmSigner`; `ExactEvmScheme`, `x402Client`, and `x402HTTPClient` create
  and encode the payment. No EIP-3009 structure is implemented locally.
- Current account and chain are checked initially and immediately before every
  `eth_signTypedData_v4` call. Each invocation creates new official typed data
  and a fresh signature request.
- Wallet rejection, insufficient funds, changed state, and other signing errors
  use stable messages that cannot include URI, signature, typed-data, balance,
  or raw wallet payload values.

`protobufjs: true` was added to the workspace build allowlist because it is a
transitive MetaMask Connect dependency with a required install script; the
frozen offline install verifies this explicit policy.

## GREEN verification

- `pnpm --filter @agentpaykit/cli test -- metamask.test.ts signer.test.ts` — 9
  files, 79 tests passed (including 4 MetaMask and 5 signer tests).
- `pnpm --filter @agentpaykit/cli test` — 9 files, 79 tests passed.
- `pnpm --filter @agentpaykit/cli typecheck` — passed.
- `pnpm --filter @agentpaykit/cli build` — passed.
- `pnpm install --frozen-lockfile --offline` — passed.
- `pnpm format:check` — passed.
- `git diff --check` — passed.
- Static search for local EIP-3009 implementation terms and sensitive logging —
  no matches.

## Concerns

- The public Base RPC endpoints are intentionally suitable only for the MVP's
  low-frequency interactive balance reads, as documented in the design.

## Review remediation

The first review identified a critical quote-binding issue: the official SDK's
default selector could sign an unsupported same-network `exact` sibling that
preceded the validated USDC requirement. New RED tests demonstrated the wrong
asset was signed, ambiguous/missing selected quotes still signed, and a provider
selection in the second permitted-account position was rejected. Four signer
tests failed before the fix.

The signer now strictly locates exactly one original requirement matching the
validated scheme, network, official USDC asset, atomic amount, and payee, then
passes a copy containing only that original requirement to the official x402
client. Zero or multiple matches fail before any signature request. The adapter
still delegates all typed-data and header construction to the official SDK.

Account checks now consistently prefer `provider.selectedAccount`, require that
it remains in the current `eth_accounts` permission set, and only fall back to
the first returned account when no provider selection exists. A cross-module
test connects a session whose selected account is the second permitted account
and successfully signs; another test changes it after the balance read and
confirms no signature request occurs.

The production default factory is now covered without dependency injection by
mocking the official `createEVMClient` export. This verifies the real call site,
privacy options, URI forwarding, and return adaptation. The whole-client type
cast was replaced by a narrow official-provider adapter.

Remediation GREEN: focused/full CLI now contain 85 passing tests; all original
verification commands are rerun below before the fix commit.
