import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

async function read(path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

const documentationPaths = [
  "README.md",
  "docs/publisher-quickstart.md",
  "docs/consumer-quickstart.md",
  "docs/architecture.md",
  "docs/runbooks/base-sepolia-mvp-gate.md",
  "docs/runbooks/base-mainnet-mvp-gate.md",
  "docs/acceptance/mvp-dod.md",
  "docs/00-plan-index.md",
] as const;

describe("developer-first MVP documentation", () => {
  it("keeps publisher onboarding to scaffold, one config and one deploy", async () => {
    const guide = await read("docs/publisher-quickstart.md");

    expect(guide).toContain("pnpm create agentpay-skill");
    expect(guide).toContain("agentpay.skill.ts");
    expect(guide).toContain("pnpm deploy");
    expect(guide).toMatch(/Next\.js App Router/i);
    expect(guide).toMatch(/Vercel/i);
    expect(guide).not.toMatch(
      /(?:write|create|implement|add).{0,40}(?:x402 middleware|facilitator verification|route glue|SKILL\.md)/i,
    );
  });

  it("documents the guarded CLI and a fresh MetaMask confirmation per call", async () => {
    const guide = await read("docs/consumer-quickstart.md");

    expect(guide).toContain("--max-price");
    expect(guide).toMatch(/MetaMask Mobile/i);
    expect(guide).toMatch(/every\s+(?:payment|call)[^.]*confirmation/i);
    expect(guide).toContain("PAYMENT_STATE_UNKNOWN");
    expect(guide).toMatch(
      /(?:never|do not|must not).{0,30}(?:auto(?:matically)?[- ]?)?retry/i,
    );
    expect(guide).not.toContain("METAMASK_INFURA_API_KEY");
  });

  it("opens with both journeys and an explicit developer-only scope", async () => {
    const readme = await read("README.md");

    expect(readme).toMatch(/Publish:.+agentpay\.skill\.ts.+pnpm deploy/is);
    expect(readme).toMatch(/Use:.+quoted price.+MetaMask.+result/is);
    expect(readme).toMatch(/Developer Preview/i);
    expect(readme).toMatch(
      /fixed USDC price per endpoint|each endpoint has one fixed USDC price/i,
    );
    expect(readme).toMatch(/no-code.+deferred/is);
    expect(readme).toMatch(/browser.+deferred/is);
  });

  it("describes the five workspaces and the two-request x402 flow", async () => {
    const architecture = await read("docs/architecture.md");
    for (const workspace of [
      "packages/cli",
      "packages/server",
      "packages/create-agentpay-skill",
      "packages/tsconfig",
      "examples/paid-repo-review",
    ]) {
      expect(architecture).toContain(workspace);
      await expect(access(resolve(root, workspace))).resolves.toBeUndefined();
    }
    expect(architecture).toMatch(/first request|request 1/i);
    expect(architecture).toMatch(/second request|request 2/i);
    expect(architecture).toContain("PAYMENT-SIGNATURE");
    expect(architecture).toContain("PAYMENT-RESPONSE");
    expect(architecture).not.toMatch(
      /Cloudflare|Browser Bridge|D1|\bR2\b|Queue|\.apkg/,
    );
  });

  it("keeps CI on current tooling and offline from wallets and live chains", async () => {
    const ci = await read(".github/workflows/ci.yml");
    const implementationPlan = await read(
      "docs/superpowers/plans/2026-07-21-developer-first-paid-skill-mvp.md",
    );
    const rootPackage = JSON.parse(await read("package.json")) as {
      packageManager?: unknown;
      engines?: unknown;
    };

    const orderedSteps = [
      "actions/checkout@v4",
      "actions/setup-node@v4",
      "npm install --global pnpm@latest",
      "pnpm install --frozen-lockfile",
      "pnpm verify",
    ];
    let previous = -1;
    for (const step of orderedSteps) {
      const position = ci.indexOf(step);
      expect(position, step).toBeGreaterThan(previous);
      previous = position;
    }
    expect(ci).toMatch(/node-version:\s*latest/);
    expect(ci).not.toMatch(/\bcorepack\b/i);
    expect(implementationPlan).not.toMatch(/\bcorepack\b/i);
    expect(implementationPlan).toContain("npm install --global pnpm@latest");
    expect(ci).not.toMatch(/node-version:\s*["']?\d/);
    expect(ci).not.toMatch(/pnpm@[0-9]/);
    expect(rootPackage.packageManager).toBeUndefined();
    expect(rootPackage.engines).toBeUndefined();
    expect(ci).not.toMatch(
      /(?:private.key|seed phrase|mnemonic|wallet secret|PAYMENT-SIGNATURE)/i,
    );
  });

  it("keeps live-network runbooks manual, redacted and human-confirmed", async () => {
    const sepolia = await read("docs/runbooks/base-sepolia-mvp-gate.md");
    const mainnet = await read("docs/runbooks/base-mainnet-mvp-gate.md");
    const combined = `${sepolia}\n${mainnet}`;

    expect(sepolia).toMatch(/success/i);
    expect(sepolia).toMatch(/user rejection/i);
    expect(sepolia).toMatch(/business failure/i);
    expect(sepolia).toContain("crypto.randomUUID()");
    expect(sepolia).toContain("api.github.com/repos/${OWNER}/${REPO}");
    expect(sepolia).toMatch(/STATUS.{0,120}404/is);
    expect(sepolia).toContain('agentpay call "$ENDPOINT"');
    expect(sepolia).toContain('--input-json "$(printf');
    expect(sepolia).toContain("UPSTREAM_NOT_FOUND");
    expect(sepolia).toContain("SKILL_EXECUTION_FAILED");
    expect(sepolia).toMatch(/zero.{0,30}(?:settle|USDC Transfer)/i);
    expect(sepolia).toMatch(/paymentState.{0,40}unknown/i);
    expect(sepolia).toMatch(/(?:never|do not).{0,20}retry/i);
    expect(mainnet).toContain("0.01 USDC");
    expect(mainnet).toMatch(/Sepolia.{0,80}(?:complete|pass)/is);
    expect(combined).toMatch(/manual/i);
    expect(combined).toMatch(/human confirmation/i);
    expect(combined).toMatch(/redact/i);
    expect(combined).toMatch(/never automate (?:wallet )?signing/i);
    expect(combined).toMatch(/never record(?: or store)?.{0,80}QR URI/is);
    expect(combined).not.toMatch(/(?:run|use|enable).{0,30}automated signing/i);
  });

  it("hands execution from completed Task 13 to current Task 14", async () => {
    const index = await read("docs/00-plan-index.md");

    expect(index).toContain("Tasks 1–13 complete; Task 14 current");
    expect(index).not.toContain("Tasks 1–12 complete; Task 13 current");
    expect(index).toMatch(/Gate F pending/i);
  });

  it("records local Gate F completion without claiming manual release gates", async () => {
    const dod = await read("docs/acceptance/mvp-dod.md");

    expect(dod).toMatch(/Status: \*\*Developer Preview only\*\*/i);
    expect(dod).toMatch(
      /- \[x\] A fresh final run of frozen clean installation, format, lint, typecheck,\s+tests, and build passes/is,
    );
    expect(dod).toMatch(/- \[x\] Final secret and scope scan/is);
    expect(dod).toMatch(/- \[ \] Final independent review/is);
    expect(dod).toMatch(/- \[ \] Manual Base Sepolia evidence/is);
    expect(dod).toMatch(/- \[ \] After Sepolia passes.+Base Mainnet/is);
    expect(dod).toMatch(/local\/reproducible.+are complete/is);
    expect(dod).toMatch(
      /Manual Base Sepolia evidence, Base Mainnet evidence, and final\s+independent review remain pending/is,
    );
  });

  it("only links to documentation and repository paths that exist", async () => {
    const markdownLink =
      /\[[^\]]*\]\((?!https?:|mailto:|#)([^)#]+)(?:#[^)]+)?\)/g;

    for (const path of documentationPaths) {
      const source = await read(path);
      for (const match of source.matchAll(markdownLink)) {
        const target = resolve(root, path, "..", match[1]);
        await expect(
          access(target),
          `${path} -> ${match[1]}`,
        ).resolves.toBeUndefined();
      }
    }
  });
});
