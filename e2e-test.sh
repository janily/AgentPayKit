#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @agentpaykit/browser-bridge test
pnpm build

echo "AgentPayKit non-paying build smoke test passed."
