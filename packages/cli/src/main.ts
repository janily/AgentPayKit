import type { InstalledSkill } from "@agentpaykit/client";

import { createCommand } from "./commands/create";
import { doctorCommand } from "./commands/doctor";
import { installCommand } from "./commands/install";
import { invokeCommand } from "./commands/invoke";
import { payInsightCommand } from "./commands/payinsight";
import { receiptsCommand } from "./commands/receipts";
import { releaseCommand } from "./commands/release";
import { resumeCommand } from "./commands/resume";
import type { SpendSummary } from "./commands/spend";
import { spendCommand } from "./commands/spend";
import { statusCommand } from "./commands/status";
import {
  errorOutput,
  humanError,
  successOutput,
  type CliCommand,
} from "./output";

export interface CliDependencies {
  platform: NodeJS.Platform;
  client: {
    invoke(skill: InstalledSkill, input: unknown): Promise<unknown>;
    status(id: string): Promise<unknown>;
    resume(id: string): Promise<unknown>;
  };
  loadSkill(path: string): Promise<InstalledSkill>;
  spend(): Promise<SpendSummary>;
  receipts(): Promise<unknown>;
  payInsight(filter: { releaseId?: string; status?: string }): Promise<unknown>;
  writeStdout(line: string): void;
  writeStderr(line: string): void;
  signals?: {
    on(signal: "SIGINT", handler: () => void): void;
    off(signal: "SIGINT", handler: () => void): void;
  };
}

function commandName(value: string | undefined): CliCommand {
  return value === "invoke" ||
    value === "status" ||
    value === "resume" ||
    value === "spend" ||
    value === "create" ||
    value === "install" ||
    value === "doctor" ||
    value === "release" ||
    value === "receipts" ||
    value === "publisher"
    ? value
    : "unknown";
}

function humanSuccess(command: CliCommand, data: unknown): string {
  const value = data as Record<string, unknown>;
  switch (command) {
    case "invoke":
      return `Invocation ${String(value.invocationId)} is ${String(value.status)} (${String(value.chargeState)})\nResume: ${String(value.resumeCommand)}`;
    case "status":
      return `Invocation ${String(value.invocationId)} is ${String(value.status)} (${String(value.chargeState)})`;
    case "resume":
      return JSON.stringify(value.result, null, 2);
    case "spend":
      return `Daily spend ${String(value.spent)}; held ${String(value.held)}; available ${String(value.available)} of ${String(value.limit)}`;
    case "create":
      return `Created paid skill at ${String(value.path)}`;
    case "install":
      return `Installed skill at ${String(value.skillRoot)} for Codex and Claude Code`;
    case "doctor":
      return `Installation healthy: ${String(value.name)} ${String(value.releaseId)}`;
    case "release":
      return JSON.stringify(value, null, 2);
    case "receipts":
    case "publisher":
      return JSON.stringify(value, null, 2);
    default:
      return "";
  }
}

export async function runCli(
  argv: string[],
  dependencies: CliDependencies,
): Promise<number> {
  const command = commandName(argv[0]);
  const args = argv.slice(1).filter((argument) => argument !== "--json");
  const json = argv.includes("--json");
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
  };
  if (command === "invoke") dependencies.signals?.on("SIGINT", interrupt);
  try {
    if (dependencies.platform !== "darwin") {
      throw Object.assign(new Error("UNSUPPORTED_PLATFORM"), {
        code: "UNSUPPORTED_PLATFORM",
        chargeState: "NOT_CHARGED",
      });
    }
    if (command === "unknown") {
      throw Object.assign(new Error("USAGE"), { code: "USAGE" });
    }
    const data =
      command === "create"
        ? await createCommand(args)
        : command === "install"
          ? await installCommand(args)
          : command === "doctor"
            ? await doctorCommand(args)
            : command === "release"
              ? await releaseCommand(args)
              : command === "receipts"
                ? await receiptsCommand(dependencies.receipts)
                : command === "publisher"
                  ? args[0] === "payinsight"
                    ? await payInsightCommand(
                        args.slice(1),
                        dependencies.payInsight,
                      )
                    : Promise.reject(
                        Object.assign(new Error("PUBLISHER_COMMAND_REQUIRED"), {
                          code: "PUBLISHER_COMMAND_REQUIRED",
                        }),
                      )
                  : command === "invoke"
                    ? await invokeCommand(args, dependencies)
                    : command === "status"
                      ? await statusCommand(args, dependencies.client)
                      : command === "resume"
                        ? await resumeCommand(args, dependencies.client)
                        : await spendCommand(dependencies.spend);
    if (interrupted && command === "invoke") {
      const invocation = data as Record<string, unknown>;
      throw Object.assign(new Error("INTERRUPTED"), {
        code: "INTERRUPTED",
        chargeState: invocation.chargeState,
        handle: { invocationId: invocation.invocationId },
      });
    }
    dependencies.writeStdout(
      json
        ? JSON.stringify(successOutput(command, data))
        : humanSuccess(command, data),
    );
    return 0;
  } catch (error) {
    const output = errorOutput(command, error);
    dependencies.writeStderr(
      json ? JSON.stringify(output) : humanError(output.error),
    );
    return output.error.code === "INTERRUPTED" ? 130 : 1;
  } finally {
    if (command === "invoke") dependencies.signals?.off("SIGINT", interrupt);
  }
}
