import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";

const repositoryRoot = new URL("../..", import.meta.url).pathname;
const workspacePaths = [
  "apps/runtime",
  "packages/browser-bridge",
  "packages/protocol",
  "packages/payment",
  "packages/runtime",
  "packages/client",
  "packages/cli",
  "packages/publisher",
  "packages/installer",
  "packages/observability",
  "packages/testkit",
];

test("declares the AgentPayKit workspace boundaries with unique names", async () => {
  const manifests = await Promise.all(
    workspacePaths.map(
      async (path) =>
        JSON.parse(
          await readFile(join(repositoryRoot, path, "package.json"), "utf8"),
        ) as {
          name: string;
          dependencies?: Record<string, string>;
        },
    ),
  );

  expect(new Set(manifests.map(({ name }) => name)).size).toBe(
    manifests.length,
  );
  expect(manifests.map(({ name }) => name)).toEqual([
    "@agentpaykit/runtime",
    "@agentpaykit/browser-bridge",
    "@agentpaykit/protocol",
    "@agentpaykit/payment",
    "@agentpaykit/runtime-core",
    "@agentpaykit/client",
    "@agentpaykit/cli",
    "@agentpaykit/publisher",
    "@agentpaykit/installer",
    "@agentpaykit/observability",
    "@agentpaykit/testkit",
  ]);
});
