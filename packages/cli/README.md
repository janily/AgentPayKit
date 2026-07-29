# AgentPayKit CLI

`agentpay` safely calls synchronous x402 paid Skills with explicit MetaMask
confirmation for every payment.

```bash
npm install --global @agentpaykit/cli@alpha
agentpay doctor
agentpay call https://skill.example/api/invoke \
  --input-file ./input.json \
  --max-price 0.05
```

The Developer Preview supports Base Sepolia USDC only. A wallet session can be
reused between calls, but every payment requires fresh confirmation. Run
`agentpay wallet disconnect` to revoke the session explicitly. Never retry
`PAYMENT_STATE_UNKNOWN` without checking chain state and obtaining new approval.
