# AgentPayKit Server

`@agentpaykit/server` is the thin, developer-facing server adapter for
synchronous x402 paid Skills. It provides the typed Skill configuration,
deterministic `SKILL.md` rendering, execution policy, and the Next.js route
adapter used by the AgentPayKit scaffold.

```ts
import { definePaidSkill } from "@agentpaykit/server";
import { createNextPaidSkillRoute } from "@agentpaykit/server/next";
```

See the repository's publisher quickstart for the supported Next.js and Vercel
workflow.
