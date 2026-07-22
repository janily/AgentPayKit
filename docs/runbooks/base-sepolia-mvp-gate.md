# Base Sepolia MVP gate

Status: **manual and pending**. This runbook records release evidence; it is not
part of CI and must never automate wallet signing.

Use a dedicated low-value test wallet, a deployed `paid-repo-review` example,
and its configured Base Sepolia payee. Confirm the deployed unsigned request
returns the expected Endpoint, `eip155:84532`, official USDC asset, amount, and
payee before opening MetaMask.

## Evidence rules

For each case record:

- UTC timestamp and deployed Endpoint;
- network, amount, redacted payee, and observed CLI code/payment state;
- payee balance or USDC Transfer evidence before and after;
- transaction hash only for the successful case.

Redact the payee unless its full value is required to verify public chain data.
Never record a QR URI, wallet session identifier, payment payload/signature,
private key, seed phrase, or unnecessary full wallet address. A human operator
must inspect the payment summary and provide every human confirmation in
MetaMask Mobile.

## Case 1 — success: one transfer

1. Record the starting payee USDC balance and UTC time.
2. Run one CLI call with the example input and an exact `--max-price` ceiling.
3. Inspect Endpoint, Base Sepolia network, amount, and redacted payee.
4. Confirm once in MetaMask Mobile.
5. Record a successful CLI result, receipt transaction hash, and the single
   matching USDC Transfer or payee balance delta.
6. Fail the gate if there is no transfer, more than one transfer, or receipt
   fields do not bind to the quote.

## Case 2 — user rejection: zero transfer

1. Record the starting balance/transfer position and UTC time.
2. Start a new call and reject its human confirmation in MetaMask Mobile.
3. Record `PAYMENT_REJECTED` with `not-charged` and verify no signed business
   request produced a USDC Transfer to the payee.

## Case 3 — business failure: zero transfer

Create a unique, syntactically valid GitHub repository URL and prove it is
absent immediately before the paid call. Run this in a Bash-compatible shell;
set `ENDPOINT` to the exact deployed `/api/invoke` URL:

```bash
ENDPOINT="https://your-deployment.example/api/invoke"
NONCE="$(node --input-type=module -e 'process.stdout.write(crypto.randomUUID().replaceAll("-", "").slice(0, 16))')"
OWNER="apk-gate-${NONCE}"
REPO="missing-${NONCE}"
REPOSITORY_URL="https://github.com/${OWNER}/${REPO}"

STATUS="$(curl --silent --show-error --output /dev/null \
  --write-out '%{http_code}' \
  "https://api.github.com/repos/${OWNER}/${REPO}")"
test "$STATUS" = "404" || {
  echo "Precheck did not return 404; abort without calling the paid Endpoint."
  exit 1
}
```

The GitHub API request is a read-only precheck. If it does not return exactly
`404`, abort this case and generate a new nonce later. After recording the
starting payee balance/transfer position, use that exact confirmed-absent URL:

```bash
agentpay call "$ENDPOINT" \
  --input-json "$(printf '{\"repository\":\"%s\"}' "$REPOSITORY_URL")" \
  --max-price 0.01 \
  --json
```

Inspect the `0.01 USDC` Base Sepolia quote and provide a separate human
confirmation. The example's business layer should throw
`UPSTREAM_NOT_FOUND`; the server intentionally does not expose that internal
error to the consumer. The expected CLI code is `SKILL_EXECUTION_FAILED`.
Because a signed error response has no successful settlement receipt, its
`paymentState` may be `unknown`: stop and never retry it.

The expected compatible-server behavior is zero Facilitator settle calls and
zero USDC Transfer. The repository conformance tests provide the zero-settle
call evidence for a thrown business error; the manual gate must separately use
payee balance and Transfer events to prove zero on-chain transfer for this exact
invocation. Record the CLI code/state and chain evidence, but do not record the
payment payload or signature.

If any case yields `PAYMENT_STATE_UNKNOWN`, stop. Do not retry. Investigate the
wallet and chain independently and mark this gate failed or inconclusive. The
Mainnet gate is blocked until all three cases have complete, reviewed evidence.
