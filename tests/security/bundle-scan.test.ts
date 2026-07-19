import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

test("built CLI is self-contained and contains no credential material", async () => {
  const path = "packages/cli/dist/index.js";
  const bundle = await readFile(path, "utf8");
  expect(bundle).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY|SEED_PHRASE\s*=/i);
  const result = spawnSync(process.execPath, [path, "doctor", "--json"], {
    encoding: "utf8",
  });
  expect(result.stderr).not.toMatch(/ERR_MODULE_NOT_FOUND/);
  expect(`${result.stdout}${result.stderr}`).toContain('"schemaVersion":"1"');
});
