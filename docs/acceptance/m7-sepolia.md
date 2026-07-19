# M7 Base Sepolia Release Gate

Status: **pending external credentials, deployed Runtime, funded isolated wallet, and E2E driver**.

The gate is opt-in and cannot broadcast from normal CI:

```bash
AGENTPAY_E2E_SEPOLIA=1 bash scripts/e2e-sepolia.sh
```

Preflight requires CDP credentials, Cloudflare account/deployment details, a testnet Release file, Base Sepolia RPC and USDC addresses, a funded isolated wallet/payee, and `SEPOLIA_E2E_DRIVER`. The driver must export `run(input)` and return the twelve scenario records defined by `tests/e2e/sepolia.test.ts`; it owns signing and must never return or log secret material.

Six scenarios use the deployed Runtime and chain: happy path, concurrent submit, Handler timeout, Policy failure, settlement recovery, and CLI resume. The remaining local rejection cases use the real Bridge with mock providers. Charged cases must bind transaction receipt, `AuthorizationUsed`, signed Receipt, user spend and payee delta; zero-charge cases must prove all deltas are zero.

Successful execution writes the allowlisted `artifacts/e2e-sepolia.json` report. Until that file records `passed=12` and `failed=0`, the Sepolia and release gates remain blocked.

## Evidence

- Commit: pending
- Release ID: pending
- Runtime deployment: pending
- Scenarios passed: pending
- Scenarios failed: pending
- Credential material stored: no
