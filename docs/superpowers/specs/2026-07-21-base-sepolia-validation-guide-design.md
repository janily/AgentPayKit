# Base Sepolia Validation Guide Design

## Purpose

Create a Chinese operator Runbook at `docs/runbooks/base-sepolia-validation.md` for validating AgentPayKit against a real Base Sepolia environment. The guide covers only the M7 Base Sepolia gate. It must not include Base Mainnet execution or third-party acceptance.

## Audience and assumptions

The operator has access to:

- this repository on the candidate commit;
- a deployed HTTPS AgentPayKit Runtime on Base Sepolia;
- CDP and Cloudflare credentials;
- a signed testnet Release document;
- a dedicated Base Sepolia wallet, payee, RPC endpoint and USDC contract;
- an operator-supplied E2E Driver that owns signing and exports the required `run(input)` function.

The repository contains the Driver interface and evidence verifier, but does not contain a production wallet-signing Driver. The Runbook must state this limitation prominently and provide an interface skeleton plus an implementation checklist without embedding private-key handling code.

## Structure

The Runbook will use these stages:

1. Explain scope, expected cost and hard stop conditions.
2. Prepare an isolated wallet, deployed Runtime, signed Release and ten required environment variables.
3. Run local no-broadcast checks and offline Release verification.
4. Implement or select the E2E Driver and validate its twelve-scenario output contract.
5. Cross-check Release, Runtime, network, asset, payee and amount before enabling the gate.
6. Execute `AGENTPAY_E2E_SEPOLIA=1 bash scripts/e2e-sepolia.sh` from an interactive operator shell.
7. Inspect `artifacts/e2e-sepolia.json`, RPC receipts, signed Runtime evidence and wallet/payee balance deltas.
8. Diagnose failures conservatively, especially settlement-unknown cases, before any rerun.
9. Commit only allowlisted, redacted evidence and update the existing acceptance record.

## Safety requirements

- Never put secrets in a tracked `.env`, command argument, shell history, Driver return value, logs or evidence.
- Use a dedicated, low-value Base Sepolia wallet.
- Treat the gate as capable of signing and broadcasting once the explicit flag is set.
- Stop on any mismatch in network, Release ID, Runtime URL/key, USDC asset, payee or amount.
- Before rerunning a chain scenario, query its Invocation and transaction state; do not assume a timeout means no settlement occurred.
- Preserve the generated report mode `0600` until it has been reviewed and redacted.
- Do not mark the release ready from Sepolia alone.

## Success criteria

The Runbook is complete when an operator can identify every prerequisite, prepare the Driver, run the existing gate and decide pass/fail without reading test implementation details. A passing run must produce a report with:

- network `eip155:84532`;
- `passed: 12` and `failed: 0`;
- four charged transactions of `10000` atomic USDC each;
- unique Invocation IDs and transaction hashes where required;
- zero transaction evidence for every non-charged scenario;
- wallet spend and payee balance deltas of `40000` atomic USDC;
- verified Runtime status, result and Receipt signatures.

## Deliverable and verification

The final deliverable is `docs/runbooks/base-sepolia-validation.md`. It will be checked with Prettier, searched for secret-like placeholders and reviewed against `scripts/e2e-sepolia.sh`, `tests/e2e/sepolia.test.ts`, `scripts/mainnet-evidence.mjs` and the M7 acceptance documents.
