import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { scaffoldPaidSkill, scaffoldTree } from "../src/scaffold";

describe("paid skill scaffold", () => {
  test("creates the complete deterministic project tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentpay-scaffold-"));
    const target = await scaffoldPaidSkill({
      name: "research-lite",
      directory: root,
    });

    expect(await scaffoldTree(target)).toEqual([
      "agentpay.json",
      "package.json",
      "pnpm-lock.yaml",
      "schemas/input.json",
      "schemas/result.json",
      "src/handler.ts",
      "src/success-policy.ts",
      "test/handler.test.ts",
      "tsconfig.json",
      "wrangler.mainnet.jsonc",
      "wrangler.testnet.jsonc",
    ]);
    expect(await readFile(join(target, "agentpay.json"), "utf8")).toContain(
      '"name": "research-lite"',
    );
    const contents = await Promise.all(
      (await scaffoldTree(target)).map((file) =>
        readFile(join(target, file), "utf8"),
      ),
    );
    expect(contents.join("\n")).not.toMatch(/private.?key|mnemonic|secret/i);
  });
});
