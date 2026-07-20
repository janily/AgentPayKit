import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

import { credentialMatches } from "./helpers/scan";

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
    const matches = credentialMatches(bytes);
    if (
      matches.length > 0 &&
      !(
        path.endsWith(".test.ts") &&
        matches.every((match) => match.startsWith("SENSITIVE_"))
      )
    ) {
      leaks.push(path);
    }
  }
  expect(leaks).toEqual([]);
});
