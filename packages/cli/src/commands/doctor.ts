import { CliError } from "../errors";

export interface DoctorResult {
  node: string;
  pnpm: string;
  metamask: "ok";
  rpc: Record<"eip155:84532" | "eip155:8453", "ok">;
}

export interface DoctorChecks {
  nodeVersion: string;
  pnpmVersion(): Promise<string>;
  initializeMetaMask(): Promise<void>;
  checkRpc(network: "eip155:84532" | "eip155:8453"): Promise<void>;
}

export async function runDoctorChecks(
  checks: DoctorChecks,
): Promise<DoctorResult> {
  const [pnpm] = await Promise.all([
    checks.pnpmVersion(),
    checks.initializeMetaMask(),
    checks.checkRpc("eip155:84532"),
    checks.checkRpc("eip155:8453"),
  ]);
  return {
    node: checks.nodeVersion,
    pnpm,
    metamask: "ok",
    rpc: { "eip155:84532": "ok", "eip155:8453": "ok" },
  };
}

export async function doctorCommand(
  args: string[],
  diagnose: () => Promise<DoctorResult>,
) {
  const { json, remaining } = parseJsonOnly(args);
  if (remaining.length !== 0)
    throw new CliError("INVALID_ARGUMENTS", "not-charged");
  return { json, value: await diagnose() };
}

export function parseJsonOnly(args: string[]) {
  const jsonCount = args.filter((value) => value === "--json").length;
  const remaining = args.filter((value) => value !== "--json");
  if (jsonCount > 1 || remaining.some((value) => value.startsWith("--"))) {
    throw new CliError("INVALID_ARGUMENTS", "not-charged");
  }
  return { json: jsonCount === 1, remaining };
}
