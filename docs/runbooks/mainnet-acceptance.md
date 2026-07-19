# Controlled Base Mainnet Acceptance

This gate uses two distinct, isolated low-value wallets. It never runs in normal CI and the preflight never signs or broadcasts a transaction.

## Preconditions

1. `HEAD` is a signed commit with a signed release tag.
2. `artifacts/e2e-simulated.json`, `artifacts/security-gates.json`, and `artifacts/e2e-sepolia.json` all report zero failures.
3. The signed mainnet Release verifies offline and binds Base Mainnet (`eip155:8453`), the intended USDC asset/payee, and `10000` atomic units (`0.01` USDC).
4. Codex and Claude Code use different wallets. Each wallet contains only the small balance needed for one acceptance call plus gas.
5. The local daily budget is exactly `20000` atomic units (`0.02` USDC).

Export the variables listed by `scripts/mainnet-preflight.sh`, then set the dynamic confirmation to `ACCEPT MAINNET <release-id>` and run:

```bash
AGENTPAY_E2E_MAINNET=1 bash scripts/mainnet-preflight.sh
```

Stop if any displayed network, payee, asset, amount, Release ID, or wallet differs from the reviewed values.

## Manual execution

Run exactly one invocation from the Codex adapter and approve it in MetaMask only after manually matching Base Mainnet, the Release payee, and `0.01` USDC. Record the returned `INVOCATION_ID`; do not copy the prompt, result, Payment Payload, or wallet data into evidence.

Repeat once from the Claude Code adapter using the second wallet. Then run for each ID:

```bash
agentpay status "$INVOCATION_ID" --json
agentpay resume "$INVOCATION_ID" --json
agentpay receipts --json
```

Verify that the Invocation IDs and transaction hashes differ, each invocation executed and settled exactly once, each transfer is exactly `10000`, both Receipts bind the expected payee/Release, and the payee balance increased by `20000` total. Hash the result locally and retain only its digest.

Fill `docs/acceptance/m7-mainnet.json` only from these verified values. Any `pending` or failed field blocks release.
