import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("records the pinned PayBot repository provenance", async () => {
  const baseline = await readFile(
    resolve(repositoryRoot, "docs/upstream/paybot-baseline.md"),
    "utf8",
  );
  const license = await readFile(resolve(repositoryRoot, "LICENSE"), "utf8");

  expect(baseline).toContain("superposition/paybot");
  expect(baseline).toContain("1d6d3f4ac33e2a338e068cdfb80a67f63544a8e1");
  expect(baseline).toContain("MIT License");
  expect(license).toContain("MIT License");
});
