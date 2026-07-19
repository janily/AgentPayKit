#!/usr/bin/env bash
set -euo pipefail

export AGENTPAY_E2E_SEPOLIA=1
exec pnpm vitest run tests/e2e/x402-sepolia-spike.test.ts --reporter=verbose
