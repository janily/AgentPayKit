# Changelog

## 0.1.0-alpha.2

### Fixed

- Load `.env.local` in generated development and deployment commands.
- Pass the public Base Sepolia receiver to Vercel build and runtime environments
  so first-time deployments do not fail with `AGENTPAY_RECEIVER_ADDRESS_REQUIRED`.

### Security

- Only the public receiver address is forwarded to Vercel; wallet private keys
  and seed phrases remain unsupported and must never enter project settings.

### Known limitations

- Base Mainnet remains out of scope for this preview.
- Real wallet and chain acceptance still requires manual execution.

## 0.1.0-alpha.1

### Added

- Base Sepolia-only Developer Preview release scope.
- Publishable package metadata for `@agentpaykit/server`, `@agentpaykit/cli`, and `create-agentpay-skill`.
- Version alignment to `0.1.0-alpha.1` across published packages and templates.

### Security

- Community preview remains manual-confirmation only for paid calls.
- No private keys, seed phrases, or long-lived wallet credentials are stored.

### Known limitations

- Base Mainnet remains out of scope for this preview.
- Dynamic pricing, subscriptions, async jobs, marketplace flows, and automatic retries are not included.
