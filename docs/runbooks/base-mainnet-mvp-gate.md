# Base Mainnet MVP gate

Status: **manual, blocked, and pending** until the complete
[Base Sepolia gate](base-sepolia-mvp-gate.md) has passed review. This runbook is
never part of CI and must never automate signing.

## Preconditions

- Sepolia has one proven success transfer, one user rejection with zero
  transfer, and one business failure with zero transfer.
- The example is deployed on Base Mainnet with a reviewed production
  Facilitator and exactly `0.01 USDC` fixed price.
- The human operator has verified the HTTPS Endpoint, official Base Mainnet
  USDC, redacted payee, wallet network, and sufficient low-value balances.

## Execute exactly one call

1. Record UTC timestamp, Endpoint, `eip155:8453`, `0.01 USDC`, redacted payee,
   starting payee USDC balance, and latest observed transfer position.
2. Start exactly one normal example call with `--max-price 0.01`.
3. Inspect the displayed Endpoint, network, amount, and payee.
4. Give exactly one human confirmation in MetaMask Mobile.
5. Record the result, CLI code/payment state, validated receipt transaction
   hash, the successful chain receipt, exactly one matching USDC Transfer, and
   the `0.01 USDC` payee delta.

Abort on rejection, mismatch, timeout, failed receipt, extra transfer, or
`PAYMENT_STATE_UNKNOWN`. Never retry an unknown state. A later attempt requires
an explicit new release decision and fresh human approval; it is not a
continuation of this gate.

Redact unnecessary wallet addresses. Never record or store the QR URI, wallet
session identifier, payment payload/signature, private key, or seed phrase. Keep
the evidence summary human-verifiable and limited to public transaction facts.
