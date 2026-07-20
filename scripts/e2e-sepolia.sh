#!/usr/bin/env bash
set -euo pipefail

if [[ "${AGENTPAY_E2E_SEPOLIA:-}" != "1" ]]; then
  echo "Refusing to run: set AGENTPAY_E2E_SEPOLIA=1 explicitly. No transaction was broadcast." >&2
  exit 2
fi

required=(
  CDP_API_KEY_ID
  CDP_API_KEY_SECRET
  CLOUDFLARE_ACCOUNT_ID
  SEPOLIA_E2E_DRIVER
  SEPOLIA_PAYEE_ADDRESS
  SEPOLIA_RELEASE_FILE
  SEPOLIA_RPC_URL
  SEPOLIA_RUNTIME_URL
  SEPOLIA_USDC_ADDRESS
  SEPOLIA_WALLET_ADDRESS
)
missing=()
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done
if (( ${#missing[@]} > 0 )); then
  printf 'Base Sepolia gate preflight failed; missing: %s. No transaction was broadcast.\n' "${missing[*]}" >&2
  exit 2
fi

if [[ ! -f "$SEPOLIA_RELEASE_FILE" || ! -f "$SEPOLIA_E2E_DRIVER" ]]; then
  echo "Release file or E2E driver does not exist. No transaction was broadcast." >&2
  exit 2
fi

preflight_home="$(mktemp -d)"
trap 'rm -rf "$preflight_home"' EXIT
AGENTPAYKIT_HOME="$preflight_home" node packages/cli/dist/index.js release verify \
  --environment testnet \
  --release "$SEPOLIA_RELEASE_FILE" \
  --json

pnpm vitest run tests/e2e/sepolia.test.ts --reporter=verbose
