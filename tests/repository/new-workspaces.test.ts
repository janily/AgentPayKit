import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("developer-first MVP workspaces", () => {
  it.each([
    ["packages/client-core/package.json", "@agentpaykit/client-core"],
    ["packages/server/package.json", "@agentpaykit/server"],
    ["packages/create-agentpay-skill/package.json", "create-agentpay-skill"],
  ])("declares %s with the expected name", async (path, name) => {
    const value = JSON.parse(await readFile(path, "utf8"));
    expect(value.name).toBe(name);
    expect(value.engines).toBeUndefined();
  });
});
