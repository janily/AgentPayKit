import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);

const packageManifestPaths = [
  "package.json",
  "packages/cli/package.json",
  "packages/server/package.json",
  "packages/create-agentpay-skill/package.json",
  "packages/tsconfig/package.json",
  "examples/paid-repo-review/package.json",
];

const executableConfigPaths = [
  ".github/workflows/ci.yml",
  "packages/cli/scripts/build.mjs",
];

test("uses the current Node and pnpm toolchain without Bun", async () => {
  const rootPackage = JSON.parse(
    await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  ) as {
    packageManager?: string;
    devEngines?: { packageManager?: unknown };
    engines?: { node?: string };
    workspaces?: unknown;
  };

  expect(rootPackage.packageManager).toBeUndefined();
  expect(rootPackage.devEngines?.packageManager).toBeUndefined();
  expect(rootPackage.engines).toBeUndefined();
  expect(rootPackage.workspaces).toBeUndefined();
  await expect(
    access(resolve(repositoryRoot, ".nvmrc"), constants.F_OK),
  ).rejects.toThrow();
  await expect(
    access(resolve(repositoryRoot, ".node-version"), constants.F_OK),
  ).rejects.toThrow();
  await expect(
    access(resolve(repositoryRoot, "bun.lock"), constants.F_OK),
  ).rejects.toThrow();
  await expect(
    access(resolve(repositoryRoot, "pnpm-lock.yaml"), constants.F_OK),
  ).resolves.toBeUndefined();

  const workspacePackages = (
    await readFile(resolve(repositoryRoot, "pnpm-workspace.yaml"), "utf8")
  )
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));

  expect(workspacePackages).toEqual([
    "packages/cli",
    "packages/server",
    "packages/create-agentpay-skill",
    "packages/tsconfig",
    "examples/paid-repo-review",
  ]);

  for (const packageManifestPath of packageManifestPaths) {
    const packageManifest = JSON.parse(
      await readFile(resolve(repositoryRoot, packageManifestPath), "utf8"),
    ) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    expect(Object.values(packageManifest.scripts ?? {})).not.toContainEqual(
      expect.stringMatching(/\b(?:bun|bunx)\b/i),
    );
    for (const version of Object.values({
      ...packageManifest.dependencies,
      ...packageManifest.devDependencies,
      ...packageManifest.peerDependencies,
    })) {
      expect(version).not.toMatch(/^[~^]/);
    }
  }

  for (const executableConfigPath of executableConfigPaths) {
    const executableConfig = await readFile(
      resolve(repositoryRoot, executableConfigPath),
      "utf8",
    );
    expect(executableConfig).not.toMatch(/\b(?:bun|bunx)\b/i);
    expect(executableConfig).not.toMatch(/\bnode\d+\b/i);
  }
});
