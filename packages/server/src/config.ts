import { usdcToAtomic } from "./amount.js";

const DEFAULT_TIMEOUT_MS = 45_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 45_000;
export const MAX_PAID_SKILL_REQUEST_BYTES = 32 * 1024;
const TESTNET_FACILITATOR = "https://x402.org/facilitator";
const KEBAB_CASE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/i;

export type SupportedNetwork = "base-sepolia" | "base";

export interface Schema<T> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues?: unknown[] } };
}

export interface PaidSkillConfig<TInput, TOutput> {
  name: string;
  version?: string;
  description: string;
  endpointPath: "/api/invoke";
  price: string;
  network: SupportedNetwork;
  payTo: `0x${string}`;
  exampleInput: TInput;
  facilitatorUrl?: string;
  timeoutMs?: number;
  input: Schema<TInput>;
  output: Schema<TOutput>;
  execute(input: TInput, context: { signal: AbortSignal }): Promise<TOutput>;
  success?(result: TOutput): boolean;
}

export type DefinedPaidSkill<TInput, TOutput> = Readonly<
  PaidSkillConfig<TInput, TOutput> & {
    version: string;
    facilitatorUrl: string;
    timeoutMs: number;
  }
>;

export function validatePaidSkillConfig(config: unknown): void {
  if (!isRecord(config)) {
    throw new Error("INVALID_PAID_SKILL_CONFIG");
  }

  if (
    typeof config.name !== "string" ||
    !KEBAB_CASE_NAME.test(config.name) ||
    (config.version !== undefined &&
      (typeof config.version !== "string" || !SEMVER.test(config.version))) ||
    typeof config.description !== "string" ||
    config.description.trim() === "" ||
    config.endpointPath !== "/api/invoke" ||
    typeof config.price !== "string" ||
    !isSupportedNetwork(config.network) ||
    !isNonZeroAddress(config.payTo) ||
    !isSchema(config.input) ||
    !isSchema(config.output) ||
    typeof config.execute !== "function" ||
    (config.success !== undefined && typeof config.success !== "function")
  ) {
    throw new Error("INVALID_PAID_SKILL_CONFIG");
  }

  usdcToAtomic(config.price);
  validateExampleInput(config.input as Schema<unknown>, config.exampleInput);
  validateTimeout(config.timeoutMs);
  validateFacilitator(config.network, config.facilitatorUrl);
}

function validateExampleInput(
  input: Schema<unknown>,
  exampleInput: unknown,
): void {
  try {
    const serialized = JSON.stringify(exampleInput);
    if (
      serialized === undefined ||
      new TextEncoder().encode(serialized).byteLength >
        MAX_PAID_SKILL_REQUEST_BYTES
    ) {
      throw new Error("INVALID_PAID_SKILL_CONFIG");
    }

    const roundTrippedValue: unknown = JSON.parse(serialized);
    if (!input.safeParse(roundTrippedValue).success) {
      throw new Error("INVALID_PAID_SKILL_CONFIG");
    }
  } catch {
    throw new Error("INVALID_PAID_SKILL_CONFIG");
  }
}

export function definePaidSkill<TInput, TOutput>(
  config: PaidSkillConfig<TInput, TOutput>,
): DefinedPaidSkill<TInput, TOutput> {
  validatePaidSkillConfig(config);

  const facilitatorUrl = config.facilitatorUrl ?? TESTNET_FACILITATOR;
  const defined: PaidSkillConfig<TInput, TOutput> & {
    version: string;
    facilitatorUrl: string;
    timeoutMs: number;
  } = {
    ...config,
    version: config.version ?? "0.1.0",
    facilitatorUrl,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  return Object.freeze(defined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSupportedNetwork(value: unknown): value is SupportedNetwork {
  return value === "base-sepolia" || value === "base";
}

function isNonZeroAddress(value: unknown): value is `0x${string}` {
  return (
    typeof value === "string" &&
    EVM_ADDRESS.test(value) &&
    !ZERO_ADDRESS.test(value)
  );
}

function isSchema(value: unknown): value is Schema<unknown> {
  return isRecord(value) && typeof value.safeParse === "function";
}

function validateTimeout(value: unknown): void {
  if (
    value !== undefined &&
    (typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < MIN_TIMEOUT_MS ||
      value > MAX_TIMEOUT_MS)
  ) {
    throw new Error("INVALID_PAID_SKILL_CONFIG");
  }
}

function validateFacilitator(
  network: SupportedNetwork,
  facilitatorUrl: unknown,
): void {
  if (facilitatorUrl === undefined) {
    if (network === "base") {
      throw new Error("INVALID_PAID_SKILL_CONFIG");
    }
    return;
  }

  if (typeof facilitatorUrl !== "string") {
    throw new Error("INVALID_PAID_SKILL_CONFIG");
  }

  let url: URL;
  try {
    url = new URL(facilitatorUrl);
  } catch {
    throw new Error("INVALID_PAID_SKILL_CONFIG");
  }

  if (
    url.protocol !== "https:" ||
    (network === "base" &&
      url.toString().replace(/\/$/, "") === TESTNET_FACILITATOR)
  ) {
    throw new Error("INVALID_PAID_SKILL_CONFIG");
  }
}
