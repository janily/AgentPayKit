# Architecture

AgentPayKit is a developer-only, synchronous paid-Skill toolkit. It composes the
official x402 v2 SDK; it does not define a payment protocol or hold funds.

## Live workspaces

| Workspace                        | Responsibility                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/create-agentpay-skill` | Generates the supported Next.js App Router + Vercel project                                      |
| `packages/server`                | Validates one Skill config, renders Skill instructions, and wraps the official x402 Next handler |
| `packages/cli`                   | Validates quotes, connects MetaMask Mobile, requests a fresh signature, and validates receipts   |
| `packages/tsconfig`              | Supplies shared strict TypeScript configuration                                                  |
| `examples/paid-repo-review`      | Exercises the complete publisher and consumer contract without a model dependency                |

There is no central execution service. Each publisher deploys its own HTTPS
Endpoint, and the Facilitator verifies and settles the consumer's authorization
to the configured public payee address.

## Two-request call flow

1. **First request (unsigned):** the CLI posts validated JSON without payment.
   Invalid business input returns `400`; valid paid input returns `402` with a
   `PAYMENT-REQUIRED` x402 v2 challenge.
2. The CLI validates the challenge against the requested Endpoint and mandatory
   `--max-price` before initializing the wallet. It displays network, fixed USDC
   amount, and payee. MetaMask Mobile requests human approval and produces a new
   EIP-712 authorization for this call.
3. **Second request (signed):** the CLI posts the same JSON once with
   `PAYMENT-SIGNATURE`. The official server adapter verifies it, runs business
   execution for at most 45 seconds, validates the result, and settles only a
   successful response.
4. The server returns JSON and `PAYMENT-RESPONSE`. The CLI binds the receipt to
   the selected account, network, amount, and a nonzero transaction hash before
   reporting success.

Wallet confirmation may wait up to five minutes and is separate from the
post-signature response timeout of at most 60 seconds. Network ambiguity after a
signed request becomes `PAYMENT_STATE_UNKNOWN`, never an automatic retry.

## Trust and security boundaries

- The publisher controls Skill code, schemas, fixed price, public payee, and
  Facilitator selection. Secrets for business APIs stay in Vercel environment
  variables.
- The official x402 packages own challenge encoding, payment verification, and
  settlement behavior. Base Sepolia and Base Mainnet official USDC are the only
  supported assets.
- MetaMask owns wallet accounts and signatures. AgentPayKit stores neither a
  private key nor a seed phrase; a reusable connection session still requires a
  fresh confirmation for every payment.
- The CLI validates protocol facts but cannot guarantee a third-party seller's
  result quality or cryptographically compel failure-no-charge behavior.

One fixed price applies per Endpoint. Dynamic/token/time pricing, async jobs,
hosted execution, subscriptions, registries, no-code publishing, browser
consumption, and automatic payment recovery are deferred.
