# Paid Repo Review

Reviews a public GitHub repository and returns actionable findings.

## Payment

- Price: 0.01 USDC per call
- Network: Base Sepolia
- Human confirmation: required in MetaMask for every call

## Invocation

agentpay call https://paid-repo-review.vercel.app/api/invoke \
--input-json '{"repository":"https://github.com/openai/openai-node"}' \
--max-price 0.01 \
--json

Never bypass `agentpay`, increase `--max-price`, or retry `PAYMENT_STATE_UNKNOWN` without asking the user.
