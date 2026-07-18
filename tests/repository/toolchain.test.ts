import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const packageManifestPaths = [
  "package.json",
  "apps/web/package.json",
  "apps/x402-facilitator/package.json",
  "packages/contracts/package.json",
  "packages/tsconfig/package.json",
  "packages/x402/package.json",
];

const executableConfigPaths = [
  "e2e-test.sh",
  "packages/contracts/scripts/start-and-deploy.sh",
  "packages/contracts/scripts/test.sh",
  "apps/web/Dockerfile",
  "apps/x402-facilitator/Dockerfile",
  "packages/contracts/Dockerfile",
  "docker-compose.yml",
];

test("pins the pnpm and Node 22 toolchain without Bun", async () => {
  const rootPackage = JSON.parse(
    await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  ) as {
    packageManager?: string;
    engines?: { node?: string };
    workspaces?: unknown;
  };

  expect(rootPackage.packageManager).toBe("pnpm@9.15.9");
  expect(rootPackage.engines?.node).toBe(">=22 <23");
  expect(rootPackage.workspaces).toBeUndefined();
  await expect(access(resolve(repositoryRoot, "bun.lock"), constants.F_OK)).rejects.toThrow();
  await expect(
    access(resolve(repositoryRoot, "pnpm-lock.yaml"), constants.F_OK),
  ).resolves.toBeUndefined();

  const workspacePackages = (await readFile(
    resolve(repositoryRoot, "pnpm-workspace.yaml"),
    "utf8",
  ))
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));

  expect(workspacePackages).toEqual(["apps/*", "packages/*"]);

  for (const packageManifestPath of packageManifestPaths) {
    const packageManifest = JSON.parse(
      await readFile(resolve(repositoryRoot, packageManifestPath), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(Object.values(packageManifest.scripts ?? {})).not.toContainEqual(
      expect.stringMatching(/\b(?:bun|bunx)\b/i),
    );
  }

  for (const executableConfigPath of executableConfigPaths) {
    await expect(
      readFile(resolve(repositoryRoot, executableConfigPath), "utf8"),
    ).resolves.not.toMatch(/\b(?:bun|bunx)\b/i);
  }
});
