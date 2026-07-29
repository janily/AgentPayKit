# Security policy

AgentPayKit `v0.1.0-alpha.1` is an unaudited Developer Preview for Base Sepolia
only. Do not use it with Base Mainnet, high-value wallets, production funds, or
wallets that hold unrelated assets.

## Report a vulnerability

Use GitHub's private vulnerability reporting for this repository. If that is
unavailable, open an issue containing no exploit details and ask the maintainer
for a private contact channel. Do not publish private keys, seed phrases, wallet
connection URIs, payment signatures, full payment payloads, API keys, or tokens.

## Supported release

Only the latest published `alpha` receives preview security fixes. No production
security or backward-compatibility guarantee is provided. Every payment must be
confirmed by a human in MetaMask. `PAYMENT_STATE_UNKNOWN` must never be retried
automatically; inspect the wallet and chain state first.

## Publisher boundary

Publishers control their Endpoint, business code, receiver, Facilitator, and
result quality. Consumers should call only trusted Endpoints and set the lowest
reasonable `--max-price`. AgentPayKit does not custody funds or store private
keys and cannot force a malicious publisher to deliver a useful result.
