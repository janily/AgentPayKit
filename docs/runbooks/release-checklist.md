# AgentPayKit MVP Release Checklist

Release is fail-closed. Do not create or publish a release tag while any item is unchecked.

- [x] `artifacts/e2e-simulated.json` records `passed=12`, `failed=0` and matches its test-generated snapshot.
- [x] `artifacts/security-gates.json` records zero failures and the bundle scan runs against a fresh build.
- [ ] `artifacts/e2e-sepolia.json` records twelve passed scenarios, zero failures, valid transaction/Receipt evidence and zero transfer for rejected cases.
- [ ] `docs/acceptance/m7-mainnet.json` records two different Invocation IDs and transaction hashes, exactly `10000` atomic USDC each, and `passed=true` for both Agents.
- [ ] `docs/acceptance/third-party-script.md` records an independent pass within 30 minutes.
- [ ] `docs/acceptance/mvp-dod.md` has no unchecked product DoD item.
- [x] Source, package, CLI bundle, logs and evidence contain no secret or full-input marker.
- [x] Independent code review and security review have no Critical or Important finding.
- [x] The six global verification commands pass from the candidate tree.
- [ ] `git status --short` is empty.
- [ ] `HEAD` is a signed commit and the proposed release tag is signed.

Only after every item passes, create the immutable tag and publish the previously reviewed artifacts. Never move or replace a published tag.
