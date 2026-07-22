import { parseMaxPrice } from "../amount";
import { callPaidSkill, type CallDependencies } from "../call";
import { CliError } from "../errors";

export interface ParsedCall {
  endpoint: string;
  input: unknown;
  maxPrice: bigint;
  timeoutSeconds: number;
  json: boolean;
}

export function parseCallArguments(args: string[]): ParsedCall {
  if (args.length === 0 || args[0]!.startsWith("--")) usage();
  const endpoint = args[0]!;
  const values = new Map<string, string>();
  let json = false;
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index]!;
    if (flag === "--json") {
      if (json) usage();
      json = true;
      continue;
    }
    if (!["--input-json", "--max-price", "--timeout"].includes(flag)) usage();
    if (values.has(flag)) usage();
    const value = args[++index];
    if (value === undefined || value.startsWith("--")) usage();
    values.set(flag, value);
  }
  const rawInput = values.get("--input-json");
  const rawMaximum = values.get("--max-price");
  if (rawInput === undefined || rawMaximum === undefined) usage();
  let input: unknown;
  try {
    input = JSON.parse(rawInput);
  } catch {
    throw new CliError("INVALID_INPUT_JSON", "not-charged");
  }
  let maxPrice: bigint;
  try {
    maxPrice = parseMaxPrice(rawMaximum);
  } catch {
    throw new CliError("INVALID_MAX_PRICE", "not-charged");
  }
  const rawTimeout = values.get("--timeout") ?? "60";
  if (!/^[1-9][0-9]*$/.test(rawTimeout)) usage();
  const timeoutSeconds = Number(rawTimeout);
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds > 60) usage();
  return { endpoint, input, maxPrice, timeoutSeconds, json };
}

export async function callCommand(
  args: string[],
  dependencies: CallDependencies,
) {
  const parsed = parseCallArguments(args);
  return {
    json: parsed.json,
    value: await callPaidSkill(parsed, dependencies),
  };
}

function usage(): never {
  throw new CliError("INVALID_ARGUMENTS", "not-charged");
}
