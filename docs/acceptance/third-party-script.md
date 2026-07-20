# Third-Party 30-Minute Acceptance Script

Status: **pending an independent macOS tester and release artifacts**.

The tester must not have participated in AgentPayKit development. Start a 30-minute timer before reading the steps and use only this page plus the supplied release bundle. Do not accept private setup help from a developer.

## Supplied bundle

The release owner supplies exactly:

- a notarized or checksum-pinned `agentpay` executable;
- a signed `deep-research-lite.apkg`;
- the expected skill name, Release ID, package SHA-256, network, payee and `0.01` USDC price;
- one isolated test wallet per Agent with the approved network already available in MetaMask.

Before continuing, compare the published checksum and Release metadata. Stop on any mismatch.

## Timed procedure

Record the elapsed minute and any blocker after each step.

1. Install for both Agents with one command:

   ```bash
   chmod 700 ./agentpay
   ./agentpay install ./deep-research-lite.apkg --json
   ```

2. Run doctor using the supplied name and Release ID:

   ```bash
   ~/.agentpaykit/client/0.1.0/agentpay doctor deep-research-lite "$RELEASE_ID" --json
   ```

3. In Codex, ask the installed `deep-research-lite` skill to research the supplied harmless topic. In MetaMask, manually compare network, payee and amount before approval. Save only the returned `INVOCATION_ID`.
4. In Claude Code, repeat with its separate wallet and a second harmless topic. Save only its different `INVOCATION_ID`.
5. For both IDs run:

   ```bash
   agentpay status "$INVOCATION_ID" --json
   agentpay resume "$INVOCATION_ID" --json
   agentpay receipts --json
   ```

6. Uninstall the Skill while preserving the shared Client:

   ```bash
   agentpay uninstall deep-research-lite "$RELEASE_ID" --json
   ```

7. Confirm both `~/.codex/skills/deep-research-lite/SKILL.md` and `~/.claude/skills/deep-research-lite/SKILL.md` are gone, while `~/.agentpaykit/client/0.1.0/agentpay` remains.

## Result record

- Tester identifier (non-sensitive): pending
- macOS version / architecture: pending
- Started / finished: pending
- Total minutes: pending
- Install: pending
- Doctor: pending
- Codex invocation/status/resume: pending
- Claude Code invocation/status/resume: pending
- Uninstall/client preservation: pending
- Blockers or unclear instructions: pending
- Overall pass (`<=30` minutes and every step passed): pending

Never record wallet addresses, Payment Payloads, prompts, results, keys, seed phrases or credentials here. The release remains blocked until an independent tester completes this record.
