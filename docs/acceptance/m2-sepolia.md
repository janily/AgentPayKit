# M2 Base Sepolia Acceptance Evidence

Status: **pending external credentials and isolated funded signer**.

The repository gate is intentionally opt-in. A normal `pnpm test` run skips it and cannot broadcast a transaction. Run:

```bash
AGENTPAY_E2E_SEPOLIA=1 ./scripts/run-sepolia-spike.sh
```

Required environment variables:

- `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET` for the deployed spike's CDP Facilitator configuration;
- `SEPOLIA_PAYEE_ADDRESS`, `SEPOLIA_USDC_ADDRESS`, `SEPOLIA_RPC_URL`, and `SEPOLIA_SPIKE_URL`;
- `SEPOLIA_SIGNER_MODULE`, an absolute or repository-relative module path exporting `createPaymentSignature(input)`. The module owns the isolated wallet and must not return or log its private key.

The test first observes the payee's USDC balance, obtains an unsigned 402 challenge, asks the external signer for a v2 `PAYMENT-SIGNATURE`, submits the paid request, waits for the receipt, and requires an exact `10000` atomic-unit (`0.01` USDC) balance increase. It logs only the transaction hash and SHA-256 header digests.

## Evidence record

- Captured at: pending
- Network: `eip155:84532`
- Amount: `10000` atomic USDC (`0.01` USDC)
- Transaction: pending
- Receipt status: pending
- Payee balance delta: pending
- `PAYMENT-REQUIRED` SHA-256: pending
- `PAYMENT-RESPONSE` SHA-256: pending

Do not paste payment payloads, API credentials, signer material, or full payment headers into this document.
