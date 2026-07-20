import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

import { securityPackageFixture } from "./helpers/package-fixture";
import { credentialMatches } from "./helpers/scan";

test("built CLI is self-contained and contains no credential material", async () => {
  const path = "packages/cli/dist/index.js";
  const bundle = await readFile(path, "utf8");
  expect(bundle).toContain("AGENTPAYKIT_EMBEDDED_BRIDGE_ASSETS");
  expect(bundle).toContain("AgentPayKit Browser Bridge");
  expect(credentialMatches(bundle)).toEqual([]);
  const result = spawnSync(process.execPath, [path, "doctor", "--json"], {
    encoding: "utf8",
  });
  expect(result.stderr).not.toMatch(/ERR_MODULE_NOT_FOUND/);
  expect(`${result.stdout}${result.stderr}`).toContain('"schemaVersion":"1"');

  const skillPackage = await securityPackageFixture();
  expect(credentialMatches(skillPackage.bytes)).toEqual([]);
  expect(
    credentialMatches(await readFile("artifacts/e2e-simulated.json")),
  ).toEqual([]);
  expect(
    credentialMatches(await readFile("artifacts/security-gates.json")),
  ).toEqual([]);
});
