import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { expect, test } from "vitest";

const repositoryRoot = new URL("../..", import.meta.url).pathname;
const productionRoots = ["apps", "packages"];
const inspectedExtensions = new Set([
  ".json",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".sol",
]);
const forbidden = [
  /QUSDToken/,
  /Escrow\.sol/,
  /hardhat/i,
  /evm-permit/,
  /X-PAYMENT/,
  /x402CheckOnly/,
];

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.name !== "node_modules" && entry.name !== "dist")
      .map(async (entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? collectFiles(path) : [path];
      }),
  );
  return files.flat();
}

test("production workspaces contain no legacy PayBot payment stack", async () => {
  const files = (
    await Promise.all(
      productionRoots.map((root) => collectFiles(join(repositoryRoot, root))),
    )
  )
    .flat()
    .filter((path) => inspectedExtensions.has(extname(path)))
    .filter((path) => !/\.(?:test|spec|stories)\.[^.]+$/.test(path));

  const matches: string[] = [];
  for (const path of files) {
    const contents = await readFile(path, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(contents)) {
        matches.push(`${relative(repositoryRoot, path)}: ${pattern.source}`);
      }
    }
  }

  expect(matches).toEqual([]);
});
