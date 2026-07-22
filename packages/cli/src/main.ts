import type { CallDependencies } from "./call";
import { callCommand } from "./commands/call";
import { doctorCommand, type DoctorResult } from "./commands/doctor";
import { walletCommand } from "./commands/wallet";
import { CliError } from "./errors";
import { errorOutput, humanError, humanSuccess, successOutput } from "./output";

export interface CliDependencies {
  call: CallDependencies;
  doctor(): Promise<DoctorResult>;
  disconnectWallet(): Promise<void>;
  writeStdout(line: string): void;
  writeStderr(line: string): void;
}

export async function runCli(
  argv: string[],
  dependencies: CliDependencies,
): Promise<number> {
  const command = argv[0];
  let json = argv.includes("--json");
  try {
    if (command !== "call" && command !== "doctor" && command !== "wallet") {
      throw new CliError("UNKNOWN_COMMAND", "not-charged");
    }
    const executed =
      command === "call"
        ? await callCommand(argv.slice(1), dependencies.call)
        : command === "doctor"
          ? await doctorCommand(argv.slice(1), dependencies.doctor)
          : await walletCommand(argv.slice(1), dependencies.disconnectWallet);
    json = executed.json;
    const callValue =
      command === "call"
        ? (executed.value as { result: unknown; payment: unknown })
        : { result: executed.value, payment: null };
    dependencies.writeStdout(
      json
        ? JSON.stringify(successOutput(callValue.result, callValue.payment))
        : humanSuccess(callValue.result, callValue.payment),
    );
    return 0;
  } catch (error) {
    const output = errorOutput(error);
    dependencies.writeStderr(
      json ? JSON.stringify(output) : humanError(output.error),
    );
    return output.error.code === "UNKNOWN_COMMAND" ||
      output.error.code === "INVALID_ARGUMENTS"
      ? 2
      : 1;
  }
}
