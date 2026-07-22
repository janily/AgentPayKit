#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { posix, win32 } from "node:path";
import { createDefaultDependencies } from "./default-dependencies";
import { runCli } from "./main";

export * from "./amount";
export * from "./call";
export * from "./challenge";
export * from "./errors";
export * from "./main";
export * from "./metamask";
export * from "./networks";
export * from "./output";
export * from "./signer";

export const PACKAGE_BOUNDARY = "@agentpaykit/cli" as const;

export function isDirectExecutionPath(
  entryPath: string | undefined,
  modulePath: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (entryPath === undefined) return false;
  const pathApi = platform === "win32" ? win32 : posix;
  const normalize = (value: string) => {
    const normalized = pathApi.normalize(value);
    return platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  return normalize(entryPath) === normalize(modulePath);
}

function resolvedEntryPath(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    return realpathSync(value);
  } catch {
    return value;
  }
}

if (
  isDirectExecutionPath(
    resolvedEntryPath(process.argv[1]),
    fileURLToPath(import.meta.url),
  )
) {
  process.exitCode = await runCli(
    process.argv.slice(2),
    createDefaultDependencies(),
  );
}
