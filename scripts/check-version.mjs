import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const expected = process.argv[2];
if (expected === undefined || !/^\d+\.\d+\.\d+-alpha\.\d+$/.test(expected)) {
  throw new Error("USAGE: check-version <x.y.z-alpha.n>");
}

const repository = resolve(import.meta.dirname, "..");
for (const manifest of [
  "package.json",
  "packages/server/package.json",
  "packages/cli/package.json",
  "packages/create-agentpay-skill/package.json",
  "packages/create-agentpay-skill/template/package.json",
  "examples/paid-repo-review/package.json",
]) {
  const value = JSON.parse(readFileSync(resolve(repository, manifest), "utf8"));
  if (value.version !== expected) {
    throw new Error(`VERSION_MISMATCH: ${manifest} is ${value.version}`);
  }
}

process.stdout.write(`Versions match ${expected}\n`);
