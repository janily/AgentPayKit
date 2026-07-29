# Releasing AgentPayKit

This repository publishes `@agentpaykit/server`, `@agentpaykit/cli`, and
`create-agentpay-skill` as Base Sepolia-only prereleases. The detailed operator
sequence is in [the external preview guide](external-preview-release-guide.md).

## Required checks

1. Use a clean, reviewed commit on `main` and confirm all three package versions
   match the intended release version, for example `0.1.0-alpha.1`.
2. Run `pnpm install --frozen-lockfile`, `pnpm verify`, and
   `pnpm package:smoke` on Node.js 20.19 or newer.
3. Confirm npm ownership, 2FA or Trusted Publishing, and that the version does
   not already exist.
4. Publish Server, CLI, then scaffolder with `--tag alpha`; never move `latest`
   to an alpha version.
5. Repeat registry installation in a new directory, deploy the example, and
   complete the manual Base Sepolia acceptance record.
6. Only after npm, deployment, Agent installation, chain evidence, and
   independent README reproduction all pass, create the annotated tag on the
   exact published commit and then create the GitHub Pre-release.

The release workflow uses npm Trusted Publishing and provenance. It must run
from an exact reviewed commit SHA, and the eventual tag must point to that same
commit. It never stores a long-lived npm token.
