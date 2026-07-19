import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { assertCleanBuild } from "../../scripts/assert-clean-build.mjs";

describe("assertCleanBuild", () => {
  test("rejects a checkout without a pnpm lockfile", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "agentpay-no-lock-"));
    await writeFile(join(rootDir, "package.json"), "{}\n", "utf8");

    await expect(
      assertCleanBuild({ rootDir, nodeVersion: "v22.23.1" }),
    ).rejects.toThrow("pnpm-lock.yaml");
  });

  test("rejects a Node major other than 22", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "agentpay-node-version-"));
    await writeFile(
      join(rootDir, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n",
      "utf8",
    );

    await expect(
      assertCleanBuild({ rootDir, nodeVersion: "v20.19.6" }),
    ).rejects.toThrow("Node.js 22");
  });
});
