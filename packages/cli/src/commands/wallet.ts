import { CliError } from "../errors";
import { parseJsonOnly } from "./doctor";

export async function walletCommand(
  args: string[],
  disconnect: () => Promise<void>,
) {
  if (args[0] !== "disconnect") {
    throw new CliError("INVALID_ARGUMENTS", "not-charged");
  }
  const { json, remaining } = parseJsonOnly(args.slice(1));
  if (remaining.length !== 0) {
    throw new CliError("INVALID_ARGUMENTS", "not-charged");
  }
  try {
    await disconnect();
  } catch {
    throw new CliError("WALLET_DISCONNECT_FAILED", "not-charged");
  }
  return { json, value: { disconnected: true } };
}
