# Consumer quickstart

The consumer is a developer using an Agent such as Codex or Claude Code. Setup
happens once; normal use is: ask the Agent, inspect the exact quote, confirm in
MetaMask Mobile, and receive the result plus receipt.

## One-time setup

Install the CLI and the desired Skill using your Agent's normal Skill mechanism:

```bash
npm install --global @agentpaykit/cli
agentpay doctor
```

Install MetaMask Mobile and fund the selected account with enough USDC on the
required Base network. The first paid call displays a QR code to establish a
wallet session. The raw connection URI is never printed or stored. A session
may persist, but it does not authorize future payments.

## Call a Skill

Usually the installed `SKILL.md` lets the Agent form the command. The equivalent
direct invocation is:

```bash
agentpay call https://skill.example/api/invoke \
  --input-json '{"repository":"https://github.com/owner/repository"}' \
  --max-price 0.05
```

`--max-price` is required. It is a local ceiling, not the authoritative price.
The CLI first sends an unsigned request and validates the returned x402 v2 quote:
Endpoint, Base network, official USDC asset, exact amount, payee, and maximum.
An invalid or over-limit quote fails before wallet access.

Before signing, inspect the displayed Endpoint, network, amount, and payee. Every
payment requires a fresh human confirmation in MetaMask Mobile, even when the
wallet session is reused. The CLI sends one signed request only after that
confirmation and returns the JSON result with a validated payment receipt.

For machine-readable output, add `--json`. To forget the connection session:

```bash
agentpay wallet disconnect
```

## Failure and retry policy

- A rejected wallet request produces `PAYMENT_REJECTED` and sends no paid
  request.
- Invalid input, an invalid quote, or a price above `--max-price` is not charged.
- A compatible server returns execution or settlement failures without a
  successful transfer.
- `PAYMENT_STATE_UNKNOWN` means the signed request was sent but the CLI could
  not prove the final settlement state. **Never automatically retry it.** Check
  the wallet and chain receipt, then obtain fresh human approval before any new
  call.

The CLI cannot prove result quality or force a malicious seller to follow the
success-only settlement contract. Treat Endpoint trust as you would for any paid
API. There is no private-key import, background signer, subscription, or browser
consumer flow in this MVP.
