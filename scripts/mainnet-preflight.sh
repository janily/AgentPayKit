#!/usr/bin/env bash
set -euo pipefail

if [[ "${AGENTPAY_E2E_MAINNET:-}" != "1" ]]; then
  echo "Refusing Mainnet preflight: set AGENTPAY_E2E_MAINNET=1. No transaction was broadcast." >&2
  exit 2
fi

required=(
  MAINNET_CLAUDE_WALLET_ADDRESS
  MAINNET_CODEX_WALLET_ADDRESS
  MAINNET_PAYEE_ADDRESS
  MAINNET_RELEASE_FILE
  MAINNET_RPC_URL
  MAINNET_USDC_ADDRESS
  MAINNET_BUDGET_LIMIT_ATOMIC
  AGENTPAY_MAINNET_CONFIRM
)
missing=()
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done
if (( ${#missing[@]} > 0 )); then
  printf 'Mainnet preflight failed; missing: %s. No transaction was broadcast.\n' "${missing[*]}" >&2
  exit 2
fi

if [[ ! -f "$MAINNET_RELEASE_FILE" ]]; then
  echo "Mainnet Release file does not exist. No transaction was broadcast." >&2
  exit 2
fi

git verify-commit HEAD >/dev/null
tag="$(git tag --points-at HEAD | head -n 1)"
if [[ -z "$tag" ]]; then
  echo "HEAD has no release tag. No transaction was broadcast." >&2
  exit 2
fi
git verify-tag "$tag" >/dev/null

node scripts/mainnet-preflight.mjs

preflight_home="$(mktemp -d)"
trap 'rm -rf "$preflight_home"' EXIT
AGENTPAYKIT_HOME="$preflight_home" node packages/cli/dist/index.js release verify \
  --environment mainnet \
  --release "$MAINNET_RELEASE_FILE" \
  --json

echo "Mainnet preflight passed. This command did not sign or broadcast a transaction."
