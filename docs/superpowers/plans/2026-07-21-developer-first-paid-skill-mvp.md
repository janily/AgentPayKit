# Developer-First Paid Skill MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current asynchronous payment platform with a developer-first MVP where a publisher scaffolds a Next.js paid Skill, edits one `agentpay.skill.ts`, deploys once to Vercel, and a developer consumer calls it through `agentpay` with a fresh MetaMask confirmation for every payment.

**Architecture:** `create-agentpay-skill` generates a fixed Next.js/Vercel application. `@agentpaykit/server` validates one config, wraps the official x402 `withX402` API, validates input before payment and output before settlement, and renders `SKILL.md`. `@agentpaykit/cli` validates the x402 v2 challenge before opening MetaMask, adapts an EIP-1193 provider to the official x402 client signer, sends exactly one paid retry, and returns the result plus receipt. The old Runtime, Queue, Bridge, Release and installer packages remain until this synchronous vertical slice passes, then are removed in one guarded migration.

**Tech Stack:** Latest stable Node.js and pnpm available in the development or CI environment, TypeScript 5.9.3, Vitest, Next.js 16.2.10 App Router, React 19.2.7, Zod 4.4.3, x402 2.19.0, viem 2.55.2, MetaMask Connect EVM 2.1.1, tsx 4.23.1, Vercel CLI 56.3.2.

## Global Constraints

- MVP users are developers; no-code publishing and browser/React consumption are explicitly out of scope.
- Publisher journey is exactly: scaffold, edit one `agentpay.skill.ts`, run one `pnpm deploy` command.
- `pnpm deploy` may perform checks and local file generation, but it must invoke exactly one Vercel production deployment.
- The publisher does not need to know the production URL before the first deployment; the deploy command captures it and renders the final `skill/SKILL.md`.
- One Endpoint has one publisher-defined fixed USDC price. Dynamic pricing, subscriptions and post-execution price calculation are forbidden.
- Supported payment requirements are x402 v2 `exact`, Base Sepolia `eip155:84532` and Base Mainnet `eip155:8453`, using official USDC only.
- Input must be valid before the `402` response. Execution errors, timeout, invalid output and `success=false` must return non-2xx so `withX402` does not settle.
- Business execution timeout is at most 45 seconds; signed HTTP request timeout is at most 60 seconds; wallet confirmation timeout is fixed at 5 minutes.
- CLI always requires `--max-price`, validates the actual challenge before creating a MetaMask client, and requests one fresh `eth_signTypedData_v4` signature per paid call.
- CLI uses `https://sepolia.base.org` and `https://mainnet.base.org` for low-frequency MVP reads; no Infura key is required from consumers.
- Private keys, seed phrases and full payment signatures must never enter logs, JSON output, fixtures or repository history.
- Real network tests are opt-in and require human MetaMask confirmation; default CI never signs or broadcasts.
- Do not pin Node.js or pnpm to a specific version in package metadata, version files, documentation or CI. Use the latest stable releases and retain `pnpm-lock.yaml` for reproducible application dependencies.
- Use exact application dependency versions from the design; every direct import must be declared by the importing workspace.
- Preserve `LICENSE` and upstream provenance. Create the `legacy-async-mvp` tag before deleting legacy code.

---

## Target File Map

| Path                                             | Responsibility                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `packages/server/src/config.ts`                  | Typed paid-Skill config and Zod-independent runtime validation         |
| `packages/server/src/amount.ts`                  | Exact USDC decimal/atomic conversion                                   |
| `packages/server/src/markdown.ts`                | Deterministic `SKILL.md` rendering from config plus an explicit origin |
| `packages/server/src/execute.ts`                 | Abort timeout, output parsing and success policy                       |
| `packages/server/src/next.ts`                    | Official x402 `withX402` composition for Next.js Route Handlers        |
| `packages/create-agentpay-skill/src/cli.ts`      | Argument parsing, destination safety and template generation           |
| `packages/create-agentpay-skill/src/scaffold.ts` | Deterministic template copy and package-name substitution              |
| `packages/create-agentpay-skill/template/`       | Complete Next.js/Vercel paid-Skill application                         |
| `packages/cli/src/amount.ts`                     | Consumer max-price parsing and atomic comparison                       |
| `packages/cli/src/challenge.ts`                  | Strict x402 v2 challenge selection and validation                      |
| `packages/cli/src/metamask.ts`                   | MetaMask Connect lifecycle, QR output and session disconnect           |
| `packages/cli/src/signer.ts`                     | EIP-1193 to official x402 `ClientEvmSigner` adapter                    |
| `packages/cli/src/call.ts`                       | Free probe, paid retry, timeout and settlement-state classification    |
| `packages/cli/src/main.ts`                       | Only `call`, `doctor`, and `wallet disconnect` commands                |
| `examples/paid-repo-review/`                     | Scaffold-equivalent deterministic GitHub repository review Skill       |
| `tests/integration/`                             | Local synchronous seller/buyer/conformance vertical slice              |
| `tests/repository/`                              | Workspace, dependency and removed-architecture assertions              |

---

### Task 1: Freeze the migration boundary and add new workspace shells

**Files:**

- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Delete: `.nvmrc`
- Delete: `.node-version`
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/create-agentpay-skill/package.json`
- Create: `packages/create-agentpay-skill/tsconfig.json`
- Create: `packages/create-agentpay-skill/src/index.ts`
- Create: `tests/repository/new-workspaces.test.ts`

**Interfaces:**

- Produces: buildable `@agentpaykit/server` and `create-agentpay-skill` workspaces without deleting legacy workspaces.
- Produces: root script `test:new-mvp` that targets only new server, scaffold, CLI-new-MVP tests and new integration tests during migration.

- [ ] **Step 1: Verify and tag the exact legacy baseline**

Run:

```bash
git status --short
git tag --list legacy-async-mvp
git tag -a legacy-async-mvp -m "Archive asynchronous AgentPayKit MVP" HEAD
```

Expected: status contains no unrelated modifications; the tag points to the last commit before implementation. If the tag already exists, verify `git rev-parse legacy-async-mvp` matches the intended baseline and do not move it.

- [ ] **Step 2: Write the failing repository test**

Create `tests/repository/new-workspaces.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("developer-first MVP workspaces", () => {
  it.each([
    ["packages/server/package.json", "@agentpaykit/server"],
    ["packages/create-agentpay-skill/package.json", "create-agentpay-skill"],
  ])("declares %s with the expected name", async (path, name) => {
    const value = JSON.parse(await readFile(path, "utf8"));
    expect(value.name).toBe(name);
    expect(value.engines).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test and confirm the packages are missing**

Run: `pnpm exec vitest run tests/repository/new-workspaces.test.ts`

Expected: FAIL with `ENOENT` for `packages/server/package.json`.

- [ ] **Step 4: Add exact package shells and the temporary migration test command**

Use these package identities and exports:

```json
{
  "name": "@agentpaykit/server",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./next": "./dist/next.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

```json
{
  "name": "create-agentpay-skill",
  "version": "0.1.0",
  "type": "module",
  "bin": { "create-agentpay-skill": "./dist/cli.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

Add root command:

```json
"test:new-mvp": "vitest run tests/repository/new-workspaces.test.ts tests/integration"
```

Pin new dependencies only when their importing task is added; do not add all dependencies to the root.

Remove the root `packageManager` and `engines` fields plus `.nvmrc` and `.node-version`. The repository must not constrain Node.js or pnpm to an exact release; developers and CI install the latest stable tools.

- [ ] **Step 5: Run the repository test**

Run: `pnpm exec vitest run tests/repository/new-workspaces.test.ts`

Expected: PASS, 2 package rows verified.

- [ ] **Step 6: Commit the migration shell**

```bash
git add package.json pnpm-workspace.yaml .nvmrc .node-version packages/server packages/create-agentpay-skill tests/repository/new-workspaces.test.ts
git commit -m "chore: add synchronous MVP workspace shells"
```

---

### Task 2: Build the single paid-Skill configuration contract

**Files:**

- Create: `packages/server/src/amount.ts`
- Create: `packages/server/src/config.ts`
- Modify: `packages/server/src/index.ts`
- Create: `packages/server/test/config.test.ts`
- Modify: `packages/server/package.json`

**Interfaces:**

- Produces: `type SupportedNetwork = "base-sepolia" | "base"`.
- Produces: `definePaidSkill<TInput, TOutput>(config: PaidSkillConfig<TInput,TOutput>): DefinedPaidSkill<TInput,TOutput>`.
- Produces: `validatePaidSkillConfig(config: unknown): void`.
- Produces: `usdcToAtomic(value: string): bigint` and `atomicToUsdc(value: bigint): string`.
- `PaidSkillConfig` contains `name`, `description`, `endpointPath`, `price`, `network`, `payTo`, optional `facilitatorUrl`, optional `timeoutMs`, `input`, `output`, `execute`, and optional `success`.

- [ ] **Step 1: Write exact amount and config failure cases**

Create tests covering these tables:

```ts
it.each([
  ["0.000001", 1n],
  ["0.05", 50_000n],
  ["0.2", 200_000n],
  ["1", 1_000_000n],
])("converts %s USDC without Number", (price, atomic) => {
  expect(usdcToAtomic(price)).toBe(atomic);
  expect(atomicToUsdc(atomic)).toBe(price);
});

it.each(["0", "-1", ".1", "1.", "1.0000001", "1e-3", " 0.1"])(
  "rejects invalid price %s",
  (price) => expect(() => usdcToAtomic(price)).toThrow("INVALID_USDC_PRICE"),
);
```

Config tests must reject: invalid kebab-case name, blank description, endpoint path other than `/api/invoke`, zero/non-address payee, unsupported network, `timeoutMs` outside `1000..45000`, Base Mainnet with `https://x402.org/facilitator`, and any price rejected above.

- [ ] **Step 2: Run the tests and confirm exports are absent**

Run: `pnpm --filter @agentpaykit/server test -- config.test.ts`

Expected: FAIL because `amount.ts` and `config.ts` do not exist.

- [ ] **Step 3: Add the typed contract**

Define schemas through the minimal structural port so any Zod schema can be used without exposing Zod in the public type:

```ts
export interface Schema<T> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues?: unknown[] } };
}

export interface PaidSkillConfig<TInput, TOutput> {
  name: string;
  description: string;
  endpointPath: "/api/invoke";
  price: string;
  network: "base-sepolia" | "base";
  payTo: `0x${string}`;
  exampleInput: TInput;
  facilitatorUrl?: string;
  timeoutMs?: number;
  input: Schema<TInput>;
  output: Schema<TOutput>;
  execute(input: TInput, context: { signal: AbortSignal }): Promise<TOutput>;
  success?(result: TOutput): boolean;
}
```

`definePaidSkill` validates once, normalizes `timeoutMs` to `45_000`, defaults the testnet facilitator to `https://x402.org/facilitator`, freezes the returned object, and never accepts price/network/payee from request input.

- [ ] **Step 4: Run server tests and typecheck**

Run:

```bash
pnpm --filter @agentpaykit/server test
pnpm --filter @agentpaykit/server typecheck
```

Expected: PASS; no use of `Number`, `parseFloat` or floating-point arithmetic in `amount.ts`.

- [ ] **Step 5: Commit the contract**

```bash
git add packages/server
git commit -m "feat(server): define fixed-price paid skill config"
```

---

### Task 3: Add deterministic Skill documentation rendering

**Files:**

- Create: `packages/server/src/markdown.ts`
- Modify: `packages/server/src/index.ts`
- Create: `packages/server/test/markdown.test.ts`

**Interfaces:**

- Consumes: `DefinedPaidSkill` from Task 2.
- Produces: `resolveEndpoint(origin: string, endpointPath: "/api/invoke"): URL`.
- Produces: `renderSkillMarkdown(skill, { origin }): string`.
- The renderer always emits the same Endpoint into prose and the `agentpay call` command, with `--max-price` equal to the config price.

- [ ] **Step 1: Write the failing snapshot-style assertions**

```ts
const markdown = renderSkillMarkdown(skill, {
  origin: "https://paid-repo-review.vercel.app/",
});

expect(markdown).toContain("https://paid-repo-review.vercel.app/api/invoke");
expect(markdown).toContain("Price: 0.05 USDC");
expect(markdown).toContain("--max-price 0.05");
expect(markdown).toContain("Network: Base Sepolia");
expect(markdown).not.toContain("GITHUB_TOKEN");
expect(markdown).not.toContain("PAYMENT-SIGNATURE");
```

Also reject non-HTTPS origins except `http://localhost`, `http://127.0.0.1`, and `http://[::1]`; strip credentials, query and fragment; reject origins with a non-root pathname.

- [ ] **Step 2: Run and observe the missing renderer**

Run: `pnpm --filter @agentpaykit/server test -- markdown.test.ts`

Expected: FAIL with missing export `renderSkillMarkdown`.

- [ ] **Step 3: Render a complete native Skill instruction**

The output must contain these sections in this order:

```markdown
# Paid Repository Review

Use this Skill when the user asks to review a public GitHub repository.

## Payment

- Price: 0.05 USDC per call
- Network: Base Sepolia
- Human confirmation: required in MetaMask for every call

## Invocation

agentpay call https://paid-repo-review.vercel.app/api/invoke \
--input-json '{"repository":"https://github.com/owner/repository"}' \
--max-price 0.05 \
--json

Never bypass `agentpay`, increase `--max-price`, or retry `PAYMENT_STATE_UNKNOWN` without asking the user.
```

Generate the title from kebab-case, JSON-escape example input, and terminate with one newline.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @agentpaykit/server test`

Expected: PASS including deterministic equality on two consecutive renders.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): render skill docs from config"
```

---

### Task 4: Compose the Next.js x402 route with success-only settlement

**Files:**

- Create: `packages/server/src/execute.ts`
- Create: `packages/server/src/next.ts`
- Create: `packages/server/test/execute.test.ts`
- Create: `packages/server/test/next.test.ts`
- Modify: `packages/server/package.json`

**Interfaces:**

- Consumes: `DefinedPaidSkill` and `usdcToAtomic`.
- Produces: `executePaidSkill(skill, rawInput): Promise<TOutput>`.
- Produces: `createNextPaidSkillRoute(skill): { POST(request: NextRequest): Promise<NextResponse> }`.
- Direct dependencies: `@x402/next@2.19.0`, `@x402/core@2.19.0`, `@x402/evm@2.19.0`, `next@16.2.10` as peer dependency.

- [ ] **Step 1: Test every pre-settlement failure**

Use a fake `withX402` injection seam and assert:

```ts
it.each([
  ["invalid input", { repository: "not-a-url" }, 400, false],
  ["execute throws", VALID_INPUT, 502, false],
  ["execute times out", VALID_INPUT, 504, false],
  ["invalid output", VALID_INPUT, 502, false],
  ["success policy rejects", VALID_INPUT, 422, false],
])("returns non-2xx for %s", async (_name, body, status, settled) => {
  const response = await POST(jsonRequest(body));
  expect(response.status).toBe(status);
  expect(facilitator.settle).toHaveBeenCalledTimes(settled ? 1 : 0);
});
```

Add request limits: non-JSON content type is `415`; malformed JSON is `400`; body larger than 32 KiB is `413`; valid result larger than 1 MiB is `502` before settlement.

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm --filter @agentpaykit/server test -- execute.test.ts next.test.ts`

Expected: FAIL because execution and route helpers are absent.

- [ ] **Step 3: Add abortable execution**

`executePaidSkill` must:

1. run `skill.input.safeParse(rawInput)` before entering x402;
2. create `AbortController` and timer for `skill.timeoutMs`;
3. call `skill.execute(parsed.data, { signal })`;
4. run output `safeParse` and `success`;
5. clear the timer in `finally`;
6. throw typed internal errors mapped only to `400`, `422`, `502`, or `504`, never `200`.

- [ ] **Step 4: Compose only official x402 primitives**

Create the resource server exactly through:

```ts
const facilitator = new HTTPFacilitatorClient({ url: skill.facilitatorUrl });
const server = new x402ResourceServer(facilitator).register(
  networkToCaip2(skill.network),
  new ExactEvmScheme(),
);

const paid = withX402(
  validatedHandler,
  {
    accepts: {
      scheme: "exact",
      price: `$${skill.price}`,
      network: networkToCaip2(skill.network),
      payTo: skill.payTo,
    },
    description: skill.description,
    mimeType: "application/json",
  },
  server,
);
```

The exported `POST` parses `request.clone()` for size/content/JSON/input validation, leaving the original request body readable by the wrapped handler, then delegates the original request to `paid`. Do not export custom x402 payload, verification or settlement types.

- [ ] **Step 5: Prove success settles once and failure settles zero times**

Run:

```bash
pnpm --filter @agentpaykit/server test
pnpm --filter @agentpaykit/server typecheck
```

Expected: PASS; success test has one handler call and one settlement, all failure rows have zero settlements.

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): add success-only Next.js paid route"
```

---

### Task 5: Build the safe Next.js Skill scaffolder

**Files:**

- Create: `packages/create-agentpay-skill/src/names.ts`
- Create: `packages/create-agentpay-skill/src/scaffold.ts`
- Create: `packages/create-agentpay-skill/src/cli.ts`
- Create: `packages/create-agentpay-skill/test/scaffold.test.ts`
- Create: `packages/create-agentpay-skill/template/agentpay.skill.ts`
- Create: `packages/create-agentpay-skill/template/app/api/invoke/route.ts`
- Create: `packages/create-agentpay-skill/template/src/review-repository.ts`
- Create: `packages/create-agentpay-skill/template/scripts/generate-skill.ts`
- Create: `packages/create-agentpay-skill/template/test/skill.test.ts`
- Create: `packages/create-agentpay-skill/template/package.json`
- Create: `packages/create-agentpay-skill/template/tsconfig.json`
- Create: `packages/create-agentpay-skill/template/next.config.ts`
- Create: `packages/create-agentpay-skill/template/vercel.json`
- Create: `packages/create-agentpay-skill/template/README.md`
- Create: `packages/create-agentpay-skill/template/.gitignore`
- Modify: `packages/create-agentpay-skill/package.json`

**Interfaces:**

- Produces: `validateProjectName(value: string): string` for lowercase npm-safe kebab-case.
- Produces: `scaffold({ cwd, projectName }): Promise<{ directory: string; files: string[] }>`.
- CLI usage: `pnpm create agentpay-skill@latest <project-name>`.

- [ ] **Step 1: Test directory safety and deterministic output**

Required tests:

```ts
it("refuses a non-empty target directory", async () => {
  await writeFile(join(target, "keep.txt"), "user data");
  await expect(scaffold({ cwd, projectName: "paid-review" })).rejects.toThrow(
    "TARGET_DIRECTORY_NOT_EMPTY",
  );
  expect(await readFile(join(target, "keep.txt"), "utf8")).toBe("user data");
});

it.each(["Paid Review", "../escape", "@scope/name", "paid_review"])(
  "rejects unsafe name %s",
  (name) =>
    expect(() => validateProjectName(name)).toThrow("INVALID_PROJECT_NAME"),
);
```

Assert the exact generated file list equals the template list and a second generation in another temp directory has byte-identical content except the substituted package/name values.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter create-agentpay-skill test`

Expected: FAIL with missing `scaffold`.

- [ ] **Step 3: Add the fixed route and single config template**

The generated route is only:

```ts
import { createNextPaidSkillRoute } from "@agentpaykit/server/next";
import skill from "../../../agentpay.skill";

export const runtime = "nodejs";
export const { POST } = createNextPaidSkillRoute(skill);
```

The generated `agentpay.skill.ts` contains all AgentPayKit publisher choices and uses `endpointPath: "/api/invoke"`; the business function remains importable from `src/review-repository.ts`. No x402 or Facilitator code appears in the template outside the server dependency.

- [ ] **Step 4: Add exact template lifecycle scripts**

Generated `package.json` scripts:

```json
{
  "dev": "tsx scripts/generate-skill.ts --origin http://localhost:3000 && next dev",
  "test": "vitest run",
  "typecheck": "tsc --noEmit",
  "build": "next build",
  "verify": "pnpm test && pnpm typecheck && pnpm build"
}
```

Pin every dependency to the Global Constraints table. Do not use caret or tilde ranges.

- [ ] **Step 5: Run scaffolder tests and inspect one generated project**

Run:

```bash
pnpm --filter create-agentpay-skill test
pnpm --filter create-agentpay-skill build
node packages/create-agentpay-skill/dist/cli.js paid-review --cwd /tmp/agentpaykit-scaffold-smoke
find /tmp/agentpaykit-scaffold-smoke/paid-review -type f | sort
```

Expected: tests PASS and output contains only the documented template tree.

- [ ] **Step 6: Commit**

```bash
git add packages/create-agentpay-skill
git commit -m "feat(scaffold): generate Next.js paid skill project"
```

---

### Task 6: Make `pnpm deploy` perform one production deployment

**Files:**

- Create: `packages/create-agentpay-skill/template/scripts/deploy.ts`
- Create: `packages/create-agentpay-skill/template/scripts/lib/deploy.ts`
- Create: `packages/create-agentpay-skill/template/test/deploy.test.ts`
- Modify: `packages/create-agentpay-skill/template/scripts/generate-skill.ts`
- Modify: `packages/create-agentpay-skill/template/package.json`
- Modify: `packages/create-agentpay-skill/package.json`

**Interfaces:**

- Produces: `deploySkill({ run, fetch, cwd }): Promise<{ origin: string; endpoint: string }>`.
- `run` executes commands as argv arrays, never through a shell string.
- The only production deployment call is `vercel deploy --prod --yes`.
- Direct dependencies for quote decoding and official asset resolution:
  `@x402/core@2.19.0`, `@x402/evm@2.19.0`.

- [ ] **Step 1: Test the exact call order and one-deployment invariant**

```ts
expect(run.mock.calls).toEqual([
  [["pnpm", "test"], cwd],
  [["pnpm", "typecheck"], cwd],
  [["pnpm", "build"], cwd],
  [["vercel", "deploy", "--prod", "--yes"], cwd],
]);
expect(run.mock.calls.filter(([argv]) => argv[0] === "vercel")).toHaveLength(1);
```

Use Vercel stdout `https://paid-review-abc.vercel.app` and assert final endpoint `https://paid-review-abc.vercel.app/api/invoke`. Assert a non-HTTPS/multi-line/malformed Vercel result fails without writing `SKILL.md`.

- [ ] **Step 2: Test post-deploy quote verification**

Mock the deployed endpoint to return `402` with a standard `PAYMENT-REQUIRED`. Assert deploy succeeds only when network, price, payee and resource URL match config; mismatch returns `DEPLOYED_QUOTE_MISMATCH` and clearly states that a deployment exists but publication verification failed.

- [ ] **Step 3: Run the failing tests**

Run: `pnpm --filter create-agentpay-skill test -- deploy.test.ts`

Expected: FAIL because `scripts/lib/deploy.ts` does not exist.

- [ ] **Step 4: Implement one-command deployment orchestration**

Required order:

1. validate the config;
2. run test, typecheck and build;
3. invoke Vercel exactly once and parse the final HTTPS URL;
4. probe `${origin}/api/invoke` with valid sample JSON and expect `402`;
5. compare the challenge to config;
6. render `skill/SKILL.md` locally with the captured origin;
7. print the endpoint, price, network, payee and path to `SKILL.md`.

Do not rerun `vercel`, alias commands or deployments after generating the document.

Add `"deploy": "tsx scripts/deploy.ts"` to the generated package only in this task, when the referenced script exists.

- [ ] **Step 5: Run template tests**

Run: `pnpm --filter create-agentpay-skill test`

Expected: PASS including one Vercel invocation and no file write on failed verification.

- [ ] **Step 6: Commit**

```bash
git add packages/create-agentpay-skill/template
git commit -m "feat(scaffold): deploy and publish skill in one command"
```

---

### Task 7: Replace the old example with `paid-repo-review`

**Files:**

- Create: `examples/paid-repo-review/` from the scaffold template
- Create: `examples/paid-repo-review/src/github.ts`
- Modify: `examples/paid-repo-review/src/review-repository.ts`
- Create: `examples/paid-repo-review/test/review-repository.test.ts`
- Create: `skills/paid-repo-review/SKILL.md`
- Do not delete yet: `examples/paid-deep-research-lite/`

**Interfaces:**

- Produces: `reviewRepository(repository: string, signal: AbortSignal): Promise<ReviewResult>`.
- Input only accepts `https://github.com/<owner>/<repo>` with exactly two non-empty path segments.
- Output: `{ summary: string; signals: string[]; recommendations: string[]; sources: string[] }`.

- [ ] **Step 1: Test URL constraints and deterministic GitHub mapping**

Reject private IPs, non-GitHub hosts, extra path operations, embedded credentials, query-based alternate URLs and missing owner/repo. Mock only these GitHub endpoints:

```text
GET https://api.github.com/repos/{owner}/{repo}
GET https://api.github.com/repos/{owner}/{repo}/languages
GET https://api.github.com/repos/{owner}/{repo}/readme
GET https://api.github.com/repos/{owner}/{repo}/commits?per_page=5
```

Assert `404`, `403` rate limit, abort and invalid upstream JSON throw typed errors consumed as non-2xx by Task 4.

- [ ] **Step 2: Run example tests and observe failure**

Run: `pnpm --filter paid-repo-review test`

Expected: FAIL because the new example workspace is absent.

- [ ] **Step 3: Generate the example through the same scaffold API**

Generate into `examples/paid-repo-review`, then replace only the business module and config values. Set example price to `0.01` on Base Sepolia and use the explicit non-zero burn address `0x000000000000000000000000000000000000dEaD` for local-only config; the live Gate injects the operator's real payee through an uncommitted config patch and verifies the diff before deployment.

- [ ] **Step 4: Add deterministic review logic**

Summary and signals must be derived from repository metadata, languages, README presence and recent commit dates. Do not call a model API. Optional `GITHUB_TOKEN` may add an Authorization header but must not appear in result, logs or `SKILL.md`.

- [ ] **Step 5: Prove the example matches scaffold conventions**

Run:

```bash
pnpm --filter paid-repo-review test
pnpm --filter paid-repo-review typecheck
pnpm --filter paid-repo-review build
```

Expected: PASS; no outgoing host other than `api.github.com` in tests.

- [ ] **Step 6: Commit**

```bash
git add examples/paid-repo-review skills/paid-repo-review
git commit -m "feat(example): add synchronous paid repository review"
```

---

### Task 8: Rebuild CLI amount and challenge validation before wallet access

**Files:**

- Create: `packages/cli/src/amount.ts`
- Create: `packages/cli/src/challenge.ts`
- Create: `packages/cli/src/networks.ts`
- Create: `packages/cli/test/amount.test.ts`
- Create: `packages/cli/test/challenge.test.ts`
- Modify: `packages/cli/package.json`

**Interfaces:**

- Produces: `parseMaxPrice(value: string): bigint`.
- Produces: `selectPaymentRequirement({ header, endpoint, maxPrice }): SelectedRequirement`.
- `SelectedRequirement` contains exact `network`, `asset`, `amount`, `payTo`, `resourceUrl`, and decoded `paymentRequired`.

- [ ] **Step 1: Write the challenge rejection matrix**

Cover x402 version other than 2, resource URL mismatch, non-`exact` scheme, unsupported network, wrong USDC contract, zero/non-integer amount, zero/invalid payee, amount above max, no acceptable candidate and more than one acceptable candidate. Each error must be one of:

```ts
"INVALID_PAYMENT_REQUIRED";
"UNSUPPORTED_PAYMENT_REQUIREMENT";
"PRICE_EXCEEDS_MAXIMUM";
```

Assert the injected `createWallet` mock has zero calls for every rejection.

- [ ] **Step 2: Run tests and confirm legacy CLI lacks the new modules**

Run: `pnpm --filter @agentpaykit/cli test -- amount.test.ts challenge.test.ts`

Expected: FAIL on missing module imports.

- [ ] **Step 3: Add exact Base constants and parsing**

```ts
export const NETWORKS = {
  "eip155:84532": {
    chainId: "0x14a34",
    rpcUrl: "https://sepolia.base.org",
    label: "Base Sepolia",
  },
  "eip155:8453": {
    chainId: "0x2105",
    rpcUrl: "https://mainnet.base.org",
    label: "Base",
  },
} as const;
```

Resolve official USDC addresses from the x402 EVM package/network helper used by version 2.19.0; do not duplicate addresses as handwritten literals in multiple modules.

- [ ] **Step 4: Decode with official x402 HTTP helpers**

Use `decodePaymentRequiredHeader` from `@x402/core/http`, exact bigint comparison, viem address validation, and exact `new URL(resource.url).href === new URL(endpoint).href`. No wallet import is allowed in `challenge.ts`.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
pnpm --filter @agentpaykit/cli test -- amount.test.ts challenge.test.ts
pnpm --filter @agentpaykit/cli typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/amount.ts packages/cli/src/challenge.ts packages/cli/src/networks.ts packages/cli/test/amount.test.ts packages/cli/test/challenge.test.ts packages/cli/package.json
git commit -m "feat(cli): validate fixed x402 quote before wallet"
```

---

### Task 9: Integrate MetaMask Connect and the official x402 signer

**Files:**

- Create: `packages/cli/src/metamask.ts`
- Create: `packages/cli/src/signer.ts`
- Create: `packages/cli/test/metamask.test.ts`
- Create: `packages/cli/test/signer.test.ts`
- Modify: `packages/cli/package.json`

**Interfaces:**

- Produces: `connectMetaMask({ network, onUri, timeoutMs }): Promise<WalletSession>`.
- `WalletSession` contains `provider`, `selectedAccount`, `chainId`, and `disconnect()`.
- Produces: `createPaymentSignature({ provider, selectedAccount, requirement }): Promise<string>`.
- Direct dependencies: `@metamask/connect-evm@2.1.1`, `@x402/core@2.19.0`, `@x402/evm@2.19.0`, `viem@2.55.2`.

- [ ] **Step 1: Test QR, account selection and privacy options**

Assert `createEVMClient` receives:

```ts
{
  dapp: { name: "AgentPayKit CLI", url: "https://github.com/janily/AgentPayKit" },
  api: { supportedNetworks: {
    "0x14a34": "https://sepolia.base.org",
    "0x2105": "https://mainnet.base.org",
  } },
  analytics: { enabled: false },
  ui: { headless: true },
  skipAutoAnnounce: true,
}
```

Test `displayUri` invokes the injected terminal QR renderer, the selected account comes from the current connect result, account/chain change before signing aborts, and 5-minute expiry maps to `WALLET_CONFIRMATION_TIMEOUT`.

- [ ] **Step 2: Test one signature per signer call**

Two consecutive `createPaymentSignature` calls on one session must produce two calls to `eth_signTypedData_v4`. User rejection code `4001` maps to `PAYMENT_REJECTED`; insufficient `balanceOf` maps to `INSUFFICIENT_USDC_BALANCE`; no signature data is included in error messages.

- [ ] **Step 3: Run failing wallet tests**

Run: `pnpm --filter @agentpaykit/cli test -- metamask.test.ts signer.test.ts`

Expected: FAIL because the new wallet modules do not exist.

- [ ] **Step 4: Adapt EIP-1193 to official x402**

Create a `ClientEvmSigner` with `address`, `signTypedData`, and `readContract`; register `new ExactEvmScheme(signer)` on `x402Client`; call `createPaymentPayload(paymentRequired)`; and encode only through `new x402HTTPClient(client).encodePaymentSignatureHeader(payload)`. Never implement EIP-3009 typed data locally.

- [ ] **Step 5: Run wallet tests and typecheck**

Run:

```bash
pnpm --filter @agentpaykit/cli test -- metamask.test.ts signer.test.ts
pnpm --filter @agentpaykit/cli typecheck
```

Expected: PASS and exactly two signature requests in the two-call test.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/metamask.ts packages/cli/src/signer.ts packages/cli/test/metamask.test.ts packages/cli/test/signer.test.ts packages/cli/package.json
git commit -m "feat(cli): confirm each payment through MetaMask"
```

---

### Task 10: Implement the two-request consumer call and minimal commands

**Files:**

- Create: `packages/cli/src/call.ts`
- Create: `packages/cli/src/errors.ts`
- Rewrite: `packages/cli/src/main.ts`
- Rewrite: `packages/cli/src/index.ts`
- Rewrite: `packages/cli/src/output.ts`
- Create: `packages/cli/src/commands/call.ts`
- Rewrite: `packages/cli/src/commands/doctor.ts`
- Create: `packages/cli/src/commands/wallet.ts`
- Create: `packages/cli/test/call.test.ts`
- Rewrite: `packages/cli/test/cli.test.ts`
- Rewrite: `packages/cli/test/output.test.ts`

**Interfaces:**

- Produces: `callPaidSkill(options, dependencies): Promise<CallResult>`.
- CLI commands only: `agentpay call`, `agentpay doctor`, `agentpay wallet disconnect`.
- JSON success: `{ ok: true, result, payment: null | { amount, currency, network, payTo, transactionHash } }`.
- JSON failure: `{ ok: false, error: { code, message, paymentState: "not-charged" | "unknown" | "charged" } }`.

- [ ] **Step 1: Write the HTTP state table as tests**

Required cases:

```text
first 2xx                         -> free success, one request, no wallet
first non-402                    -> ENDPOINT_REQUEST_FAILED, no wallet
invalid/over-limit 402           -> validation error, no wallet
wallet rejection                 -> PAYMENT_REJECTED, no paid request
signed 4xx/5xx                   -> SKILL_EXECUTION_FAILED, no retry
signed timeout/network loss      -> PAYMENT_STATE_UNKNOWN, no retry
signed 2xx without receipt       -> PAYMENT_STATE_UNKNOWN
signed body over 1 MiB           -> RESULT_TOO_LARGE; receipt decides charged/unknown
signed 2xx plus valid receipt    -> paid success, exactly two requests
```

Assert `fetch` is called at most twice and `createPaymentSignature` at most once for a single `callPaidSkill` invocation.

- [ ] **Step 2: Run call tests and observe failure**

Run: `pnpm --filter @agentpaykit/cli test -- call.test.ts`

Expected: FAIL because `callPaidSkill` is missing.

- [ ] **Step 3: Add bounded request/response handling**

Validate POST JSON at most 32 KiB before the first request. First request has no payment header. After challenge validation, print summary, connect/sign, then send one second request with `PAYMENT-SIGNATURE`. The 60-second timer begins immediately before the signed request; wallet waiting uses its separate fixed timer. Stream/limit responses so more than 1 MiB is rejected without buffering unbounded data.

- [ ] **Step 4: Parse the official payment receipt**

Decode `PAYMENT-RESPONSE` with official x402 HTTP utilities. Return only amount, `USDC`, network, payee and transaction hash. Do not return raw challenge, raw payment payload, signature or wallet balance.

- [ ] **Step 5: Replace the old command surface**

Parser requirements:

```text
agentpay call <https-endpoint> --input-json <json> --max-price <usdc> [--timeout 1..60] [--json]
agentpay doctor [--json]
agentpay wallet disconnect [--json]
```

`doctor` reports the current Node.js and pnpm versions, checks MetaMask Connect initialization and Base RPC reachability, but never rejects a current stable toolchain, connects a wallet or signs. Unknown legacy commands exit `2` with `UNKNOWN_COMMAND` and list only the three supported commands.

- [ ] **Step 6: Run CLI tests**

Run:

```bash
pnpm --filter @agentpaykit/cli test
pnpm --filter @agentpaykit/cli typecheck
pnpm --filter @agentpaykit/cli build
```

Expected: PASS; snapshots contain no raw payment headers.

- [ ] **Step 7: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): call synchronous paid skills safely"
```

---

### Task 11: Add local conformance and end-to-end integration gates

**Files:**

- Create: `tests/integration/fixtures/facilitator.ts`
- Create: `tests/integration/fixtures/wallet.ts`
- Create: `tests/integration/fixtures/paid-server.ts`
- Create: `tests/integration/publisher-flow.test.ts`
- Create: `tests/integration/consumer-flow.test.ts`
- Create: `tests/integration/conformance.test.ts`
- Modify: `package.json`

**Interfaces:**

- Produces: local deterministic seller/buyer loop with settlement counters.
- Produces: publisher conformance cases that can be reused by generated template tests.

- [ ] **Step 1: Write the ten vertical-slice acceptance cases**

Cover: standard unsigned `402`; exact `0.001`, `0.05`, `0.2` quotes; success executes once/settles once; bad input fails before `402`; wallet rejection sends no signed request; handler throw/timeout/invalid output/success false each settle zero times; signed response loss becomes unknown and is not retried.

- [ ] **Step 2: Run the integration suite and observe missing fixtures**

Run: `pnpm exec vitest run tests/integration`

Expected: FAIL on missing fixture modules.

- [ ] **Step 3: Add in-memory fixtures with explicit counters**

Fixtures expose only:

```ts
type Counters = {
  unsignedRequests: number;
  signedRequests: number;
  handlerExecutions: number;
  verifyCalls: number;
  settleCalls: number;
  signatureRequests: number;
};
```

No private key is needed: the fake wallet returns a syntactically valid fixture payload accepted only by the fake facilitator.

- [ ] **Step 4: Run all new-MVP tests**

Run:

```bash
pnpm --filter @agentpaykit/server test
pnpm --filter create-agentpay-skill test
pnpm --filter @agentpaykit/cli test
pnpm exec vitest run tests/integration tests/repository/new-workspaces.test.ts
```

Expected: PASS with exact counter assertions, not merely status-code assertions.

- [ ] **Step 5: Commit**

```bash
git add tests/integration package.json
git commit -m "test: prove synchronous paid skill conformance"
```

---

### Task 12: Remove the legacy architecture only after the new gate passes

**Files:**

- Delete: `apps/runtime/`
- Delete: `packages/runtime/`
- Delete: `packages/protocol/`
- Delete: `packages/payment/`
- Delete: `packages/client/`
- Delete: `packages/browser-bridge/`
- Delete: `packages/publisher/`
- Delete: `packages/installer/`
- Delete: `packages/observability/`
- Delete: `packages/testkit/`
- Delete: `examples/paid-deep-research-lite/`
- Delete: obsolete `tests/e2e/scenarios/`
- Delete: obsolete `docs/01-m0-*` through `docs/08-m7-*`
- Delete: obsolete async/bridge/release acceptance and runbook documents
- Create: `tests/repository/no-legacy-architecture.test.ts`
- Rewrite: `pnpm-workspace.yaml`
- Rewrite: `turbo.json`
- Rewrite: `package.json`

**Interfaces:**

- Final workspace packages: CLI, Server, scaffolder, shared tsconfig, paid-repo-review example.
- Final root verification: format, lint, typecheck, unit/integration tests and builds for only the new architecture.

- [ ] **Step 1: Re-run the new gate before deletion**

Run: `pnpm test:new-mvp`

Expected: PASS. Stop this task if it fails.

- [ ] **Step 2: Write a failing absence test before removing files**

```ts
it.each([
  "apps/runtime",
  "packages/runtime",
  "packages/protocol",
  "packages/payment",
  "packages/client",
  "packages/browser-bridge",
  "packages/publisher",
  "packages/installer",
  "packages/observability",
  "packages/testkit",
  "examples/paid-deep-research-lite",
])("does not retain legacy path %s", async (path) => {
  await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
});
```

Also assert root scripts do not contain `runtime`, `bridge`, `resume`, `release`, `apkg`, `wrangler`, `queue`, `D1` or `R2`.

- [ ] **Step 3: Run and confirm the guard fails against legacy paths**

Run: `pnpm exec vitest run tests/repository/no-legacy-architecture.test.ts`

Expected: FAIL because legacy paths still exist.

- [ ] **Step 4: Delete only the enumerated legacy paths and rewrite workspace metadata**

Use patch-based deletions or explicit path-by-path removal after verifying each target. Do not delete `.git`, repository root, `LICENSE`, upstream provenance, new packages, new tests or the new example.

Final root scripts:

```json
{
  "build": "turbo run build",
  "test": "turbo run test && vitest run tests/integration tests/repository",
  "lint": "turbo run lint",
  "typecheck": "turbo run typecheck",
  "format:check": "prettier --check \"**/*.{ts,tsx,md,json}\"",
  "verify": "node scripts/assert-clean-build.mjs && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build"
}
```

- [ ] **Step 5: Install with the current stable toolchain and run the repository guard**

Run:

```bash
pnpm install --frozen-lockfile
pnpm exec vitest run tests/repository
```

Expected: PASS and lockfile contains no legacy workspace importers.

- [ ] **Step 6: Commit the guarded removal**

```bash
git add -A
git commit -m "refactor: remove asynchronous payment platform"
```

---

### Task 13: Rewrite product documentation and CI around the developer journeys

**Files:**

- Rewrite: `README.md`
- Create: `docs/publisher-quickstart.md`
- Create: `docs/consumer-quickstart.md`
- Create: `docs/architecture.md`
- Create: `docs/runbooks/base-sepolia-mvp-gate.md`
- Create: `docs/runbooks/base-mainnet-mvp-gate.md`
- Rewrite: `docs/acceptance/mvp-dod.md`
- Rewrite: `.github/workflows/ci.yml`
- Modify: `docs/00-plan-index.md`
- Create: `tests/repository/docs-scope.test.ts`

**Interfaces:**

- Publisher docs show only scaffold → config → deploy.
- Consumer docs show install CLI/Skill once → natural-language call → MetaMask confirmation → result.
- CI installs the current stable Node.js and pnpm releases and runs `pnpm verify`; no wallet or live-chain secret.

- [ ] **Step 1: Write documentation scope tests**

Assert publisher quickstart contains `pnpm create agentpay-skill`, `agentpay.skill.ts`, and `pnpm deploy`; it must not instruct users to handwrite x402 middleware, Facilitator verification, Route glue or `SKILL.md`. Assert consumer quickstart contains `--max-price`, MetaMask per-call confirmation and `PAYMENT_STATE_UNKNOWN`; it must not require `METAMASK_INFURA_API_KEY`.

- [ ] **Step 2: Run docs tests and observe old-copy failures**

Run: `pnpm exec vitest run tests/repository/docs-scope.test.ts`

Expected: FAIL because the new quickstarts do not exist.

- [ ] **Step 3: Rewrite docs from the two journeys**

README opening promise:

```text
Publish: scaffold → edit agentpay.skill.ts → pnpm deploy
Use: ask your Agent → review the quoted price → confirm in MetaMask → receive the result
```

Explicitly state: developer-only MVP, fixed USDC price per Endpoint, Next.js + Vercel publisher support, CLI consumer support, no-code and browser consumer flows deferred, failure-no-charge is the compatible server contract rather than a guarantee the CLI can enforce against malicious sellers.

- [ ] **Step 4: Add manual real-network gates**

Base Sepolia runbook has three separately confirmed cases: success, user rejection, business failure. Mainnet runs only after Sepolia evidence passes, uses `0.01 USDC`, one call, one human confirmation, and validates payee delta plus transaction receipt. Neither runbook stores secrets or automates signing.

- [ ] **Step 5: Use current stable tooling in CI and run documentation tests**

CI steps must be:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: latest
- run: npm install --global pnpm@latest
- run: pnpm install --frozen-lockfile
- run: pnpm verify
```

`npm install --global pnpm@latest` is intentionally the only pnpm installation
mechanism. Enabling a separate package-manager shim first can make the global
latest-version install fail with `EEXIST`, and current Node.js releases are not
guaranteed to bundle that shim manager. This correction preserves the
unversioned current-stable toolchain requirement and follows observed tool
behavior.

Run: `pnpm exec vitest run tests/repository/docs-scope.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md docs .github/workflows/ci.yml tests/repository/docs-scope.test.ts
git commit -m "docs: publish developer-first MVP journeys"
```

---

### Task 14: Verify reproducibility and execute opt-in release gates

**Files:**

- Modify: `scripts/assert-clean-build.mjs`
- Create: `tests/repository/clean-install.test.ts`
- Create after manual runs: `docs/acceptance/evidence/base-sepolia-summary.md`
- Create after manual run: `docs/acceptance/evidence/base-mainnet-summary.md`

**Interfaces:**

- Produces: deterministic clean-copy verification that excludes `.git`, `node_modules`, `.turbo`, `.next`, coverage and prior evidence.
- Produces: redacted human-verifiable chain evidence containing tx hash, network, amount and payee only.

- [ ] **Step 1: Test the clean-copy verifier command contract**

Assert it uses the current Node.js executable and the pnpm available on `PATH`, creates a temporary copy, runs `pnpm install --frozen-lockfile`, then `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. It must fail if the copy can resolve an undeclared dependency from the original repository.

- [ ] **Step 2: Run full local verification under the installed stable Node.js and pnpm**

Run:

```bash
node --version
pnpm --version
pnpm verify
```

Expected: the commands report the installed current stable versions and every clean-install/unit/integration/build stage passes. No exact Node.js or pnpm version is enforced by the repository.

- [ ] **Step 3: Run the Base Sepolia Gate manually**

Follow `docs/runbooks/base-sepolia-mvp-gate.md`. Record one successful settlement, one MetaMask rejection and one business failure. For rejection and failure, verify no USDC Transfer. Redact wallet connection URIs and payment signatures.

- [ ] **Step 4: Run the controlled Base Mainnet Gate manually**

Only after Step 3 passes, deploy the example with production Facilitator and `0.01 USDC`, confirm once in MetaMask, and verify exactly one Transfer to the configured payee. Never retry an unknown payment state.

- [ ] **Step 5: Final secret and scope scan**

Run:

```bash
rg -n "(private[_ -]?key|seed phrase|mnemonic|PAYMENT-SIGNATURE|METAMASK_INFURA_API_KEY)" . \
  -g '!node_modules/**' -g '!.git/**' -g '!pnpm-lock.yaml'
rg -n "(browser-bridge|apps/runtime|packages/runtime|\.apkg|resume|release signer|D1|R2|Queue)" \
  README.md docs package.json pnpm-workspace.yaml packages examples tests
```

Expected: first scan finds only deliberate security statements/tests with dummy redacted values; second scan finds only migration history in the design/plan, not live product instructions or workspace references.

- [ ] **Step 6: Commit verified evidence**

```bash
git add scripts/assert-clean-build.mjs tests/repository/clean-install.test.ts docs/acceptance/evidence
git commit -m "test: verify developer-first paid skill MVP"
```

---

## Execution Order and Review Gates

| Gate                    | Tasks | Required evidence before continuing                                               |
| ----------------------- | ----- | --------------------------------------------------------------------------------- |
| A — Publisher core      | 1–4   | Config, markdown and success-only x402 route tests pass                           |
| B — One-command publish | 5–7   | Scaffold clean build; one Vercel invocation test; example passes                  |
| C — Consumer core       | 8–10  | Invalid quote never opens wallet; each call signs once; no automatic paid retry   |
| D — Vertical slice      | 11    | Local success settles once; all failure paths settle zero times                   |
| E — Migration           | 12    | New gate passes before deletion; legacy absence tests pass afterward              |
| F — Release             | 13–14 | Clean current-toolchain build, Sepolia evidence, then controlled Mainnet evidence |

## Self-Review Results

- **Spec coverage:** Publisher, consumer, fixed-price, MetaMask, success-only settlement, one-deployment, clean-build, legacy removal and live Gate requirements each map to at least one task.
- **Scope control:** No-code builder, React/browser buyer SDK, dynamic pricing, async jobs, Registry, package signing, platform fees and automatic recovery have no implementation tasks.
- **Type consistency:** `endpointPath`, `DefinedPaidSkill`, `SelectedRequirement`, `WalletSession`, `CallResult` and stable error codes are introduced once and consumed under the same names.
- **Migration safety:** Legacy deletion cannot begin until the new synchronous integration gate passes, and the immutable tag preserves the previous implementation.
- **User-journey consistency:** Publishers edit one AgentPayKit config and run one deployment command; consumers do not need an Infura key and confirm every paid call in MetaMask.
