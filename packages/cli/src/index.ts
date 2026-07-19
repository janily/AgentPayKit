#!/usr/bin/env node
import { createDefaultDependencies } from "./default-dependencies";
import { runCli } from "./main";

export * from "./commands/create";
export * from "./commands/doctor";
export * from "./commands/install";
export * from "./commands/invoke";
export * from "./commands/resume";
export * from "./commands/spend";
export * from "./commands/status";
export * from "./main";
export * from "./output";

export const PACKAGE_BOUNDARY = "@agentpaykit/cli" as const;

if (
  process.argv[1]?.endsWith("/agentpay") ||
  process.argv[1]?.endsWith("/index.js")
) {
  if (process.platform !== "darwin") {
    process.stderr.write(
      `${JSON.stringify({ schemaVersion: "1", ok: false, command: process.argv[2] ?? "unknown", error: { code: "UNSUPPORTED_PLATFORM", message: "UNSUPPORTED_PLATFORM", chargeState: "NOT_CHARGED" } })}\n`,
    );
    process.exitCode = 1;
  } else {
    const dependencies = await createDefaultDependencies();
    process.exitCode = await runCli(process.argv.slice(2), dependencies);
  }
}
