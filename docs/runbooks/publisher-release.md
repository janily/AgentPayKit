# Publisher Release Runbook

Build and sign testnet and mainnet Releases separately. Never copy a testnet Release or Runtime Delegation into a mainnet deployment.

Configure these secret names through `wrangler secret put`; do not store their values in source files or shell history:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`
- `UPSTREAM_API_KEY`
- `AGENTPAY_ENCRYPTION_KEY`

Run an offline gate before deployment:

```sh
agentpay release verify --environment testnet --release release.testnet.json
agentpay release deploy --environment testnet --release release.testnet.json \
  --config-digest <current> --expected-config-digest <signed>
```

The deploy command reports the exact Wrangler command without executing it. Mainnet additionally requires `--confirm "DEPLOY MAINNET <release-id>"`.
