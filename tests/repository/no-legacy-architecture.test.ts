import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

const legacyPaths = [
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
  "tests/e2e",
  "tests/legacy-async",
  "tests/release",
  "tests/security",
  "artifacts",
  "e2e-test.sh",
  "scripts/e2e-sepolia.sh",
  "scripts/mainnet-evidence.mjs",
  "scripts/mainnet-preflight.mjs",
  "scripts/mainnet-preflight.sh",
  "scripts/run-sepolia-spike.sh",
  "docs/01-m0-fork-baseline.md",
  "docs/02-m1-prune-legacy-paybot.md",
  "docs/03-m2-official-x402-workers-spike.md",
  "docs/04-m3-async-runtime-settlement.md",
  "docs/05-m4-client-browser-bridge.md",
  "docs/06-m5-publisher-release-installer.md",
  "docs/07-m6-deep-research-observability.md",
  "docs/08-m7-e2e-mainnet-release.md",
  "docs/acceptance/m2-sepolia.md",
  "docs/acceptance/m6-example.md",
  "docs/acceptance/m7-mainnet.json",
  "docs/acceptance/m7-sepolia.md",
  "docs/acceptance/third-party-script.md",
  "docs/runbooks/base-sepolia-validation.md",
  "docs/runbooks/mainnet-acceptance.md",
  "docs/runbooks/publisher-release.md",
  "docs/runbooks/release-checklist.md",
] as const;

const legacyCliPaths = [
  "packages/cli/src/bridge-assets.ts",
  "packages/cli/src/commands/create.ts",
  "packages/cli/src/commands/install.ts",
  "packages/cli/src/commands/invoke.ts",
  "packages/cli/src/commands/payinsight.ts",
  "packages/cli/src/commands/receipts.ts",
  "packages/cli/src/commands/release.ts",
  "packages/cli/src/commands/resume.ts",
  "packages/cli/src/commands/shared.ts",
  "packages/cli/src/commands/spend.ts",
  "packages/cli/src/commands/status.ts",
  "packages/cli/src/commands/uninstall.ts",
  "packages/cli/test/load-skill.test.ts",
  "packages/cli/test/release.test.ts",
  "packages/cli/test/uninstall.test.ts",
] as const;

const liveWorkspaces = [
  "packages/cli",
  "packages/server",
  "packages/create-agentpay-skill",
  "packages/tsconfig",
  "examples/paid-repo-review",
] as const;

const forbiddenMetadataTerms = [
  "runtime",
  "bridge",
  "resume",
  "release",
  "apkg",
  "wrangler",
  "queue",
  "d1",
  "r2",
] as const;

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(root, path), "utf8")) as Record<
    string,
    unknown
  >;
}

describe("legacy architecture removal", () => {
  it.each([...legacyPaths, ...legacyCliPaths])(
    "does not retain legacy path %s",
    async (path) => {
      await expect(access(resolve(root, path))).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );

  it("declares exactly the five live workspace projects", async () => {
    const workspace = await readFile(
      resolve(root, "pnpm-workspace.yaml"),
      "utf8",
    );
    const declared = workspace
      .split("\n")
      .map((line) => /^\s*-\s+(.+?)\s*$/.exec(line)?.[1])
      .filter((entry): entry is string => entry !== undefined);

    expect(declared).toEqual(liveWorkspaces);
    await Promise.all(
      liveWorkspaces.map((path) => access(resolve(root, path, "package.json"))),
    );
  });

  it("keeps root live metadata free of legacy concepts", async () => {
    const packageJson = await readJson("package.json");
    const liveMetadata = JSON.stringify({
      scripts: packageJson.scripts,
      devEngines: packageJson.devEngines,
    }).toLowerCase();

    for (const term of forbiddenMetadataTerms) {
      expect(liveMetadata).not.toContain(term);
    }
  });

  it("runs build, test and typecheck for every live workspace", async () => {
    const rootPackage = await readJson("package.json");
    const rootScripts = rootPackage.scripts as Record<string, string>;

    expect(rootScripts.build).toBe("pnpm -r run build");
    expect(rootScripts.typecheck).toBe("pnpm -r run typecheck");
    expect(rootScripts.test).toBe(
      "pnpm -r run test && vitest run tests/integration tests/repository",
    );
    expect(rootScripts.lint).toBe("pnpm -r run lint");

    for (const workspace of liveWorkspaces) {
      const packageJson = await readJson(`${workspace}/package.json`);
      const scripts = packageJson.scripts as Record<string, string> | undefined;
      expect(scripts, workspace).toBeDefined();
      for (const command of ["build", "lint", "test", "typecheck"]) {
        expect(scripts?.[command], `${workspace} ${command}`).toBeTruthy();
      }
    }
  });

  it("declares exactly the root and five live lockfile importers", async () => {
    const lockfile = await readFile(resolve(root, "pnpm-lock.yaml"), "utf8");
    const importerBlock = lockfile
      .split(/^importers:\s*$/m)[1]
      ?.split(/^packages:\s*$/m)[0];
    expect(importerBlock).toBeDefined();
    const importers = [
      ...(importerBlock ?? "").matchAll(/^  ([^\s].*?):(?:\s.*)?$/gm),
    ].map(([, importer]) => importer.replace(/^['"]|['"]$/g, ""));

    expect(importers.sort()).toEqual([".", ...liveWorkspaces].sort());
  });
});
