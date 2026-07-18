# PayBot upstream baseline

## Pinned source

- Repository: https://github.com/superposition/paybot
- Commit: `1d6d3f4ac33e2a338e068cdfb80a67f63544a8e1`
- License: MIT License (the repository `LICENSE` is preserved byte-for-byte;
  SHA-256 at capture: `cd67cd7470b0671192cc6799690f4ebf23effff2f52c8df19c12de7698d07003`)

Use `git diff 1d6d3f4...HEAD` as the audit entry point for every adaptation
change after this capture.

## Reuse and removal boundary

| Status | Paths | Decision |
| --- | --- | --- |
| Reuse | `LICENSE` | Retain unchanged; it is the upstream MIT license. |
| Reuse | The pinned Git history at the commit above | Treat as read-only provenance for comparison, not as a migration target in M0. |
| Remove in M1 | `packages/contracts/` | Legacy PayBot contract artifacts and their tests are scheduled for removal. |
| Remove in M1 | `packages/x402/` | Legacy custom x402 implementation is scheduled for removal. |

This M0 capture does not repair, compile, remove, or otherwise alter those
legacy paths.

## Approved inherited baseline failures

The user approved continuing from this upstream baseline on 2026-07-18. These
known upstream failures are recorded as evidence only and must not be repaired
before M0 is complete:

- 68 of 69 PayBot contract tests fail because the contract artifacts have not
  been compiled.
- The `packages/x402` DTS build fails because `RequestInit`, `Response`, and
  `fetch` types are absent.
