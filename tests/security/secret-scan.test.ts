import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

const sensitive = new RegExp(
  [
    "BEGIN [A-Z ]*PRIVATE KEY",
    "(?:CLOUDFLARE_API_TOKEN|CDP_API_SECRET|SEED_PHRASE)\\s*[:=]\\s*[\\\"'][^\\\"']+",
    "(?:sk|rk|pk)_(?:live|prod)_[A-Za-z0-9]{16,}",
  ].join("|"),
  "i",
);

test("tracked source, fixtures, evidence, and logs contain no credential material", async () => {
  const paths = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((path) => !path.endsWith("pnpm-lock.yaml"));
  const leaks: string[] = [];
  for (const path of paths) {
    const bytes = await readFile(path);
    if (bytes.includes(0)) continue;
    if (sensitive.test(bytes.toString("utf8"))) leaks.push(path);
  }
  expect(leaks).toEqual([]);
});
