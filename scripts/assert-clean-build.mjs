import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

export async function assertCleanBuild({
  rootDir = resolve(scriptDirectory, ".."),
  nodeVersion = process.version,
} = {}) {
  const major = Number.parseInt(nodeVersion.replace(/^v/, "").split(".")[0] ?? "", 10);
  if (major !== 22) {
    throw new Error(`AgentPayKit requires Node.js 22; received ${nodeVersion}`);
  }

  await access(resolve(rootDir, "pnpm-lock.yaml"), constants.F_OK).catch(() => {
    throw new Error("pnpm-lock.yaml is required for a reproducible build");
  });

  const manifest = JSON.parse(await readFile(resolve(rootDir, "package.json"), "utf8"));
  if (manifest.packageManager !== "pnpm@9.15.9") {
    throw new Error("packageManager must be pinned to pnpm@9.15.9");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertCleanBuild().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
