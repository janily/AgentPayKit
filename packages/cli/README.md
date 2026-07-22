# AgentPayKit CLI

`agentpay` safely calls synchronous x402 paid Skills with explicit MetaMask
confirmation for every payment.

```bash
npm install --global @agentpaykit/cli
agentpay doctor
agentpay call https://skill.example/api/invoke \
  --input-json '{"topic":"x402"}' \
  --max-price 0.05
```

The MVP supports Base and Base Sepolia USDC payments. A wallet session can be
reused between calls; run `agentpay wallet disconnect` to revoke it explicitly.
