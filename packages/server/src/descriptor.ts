import { createHash } from "node:crypto";

import { usdcToAtomic } from "./amount.js";
import {
  MAX_PAID_SKILL_REQUEST_BYTES,
  type DefinedPaidSkill,
  type SupportedNetwork,
} from "./config.js";

const SCHEMA_VERSION = "agentpaykit.paid-skill.v1";
const WELL_KNOWN_DESCRIPTOR_PATH = "/.well-known/agentpay-skill.json";
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/i;
const USDC_ASSETS = {
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
} as const;

export interface PaidSkillDescriptor {
  schemaVersion: typeof SCHEMA_VERSION;
  skillId: string;
  version: string;
  name: string;
  description: string;
  descriptorUrl: string;
  endpoint: string;
  price: {
    amount: string;
    atomicAmount: string;
    currency: "USDC";
  };
  network: "eip155:84532" | "eip155:8453";
  asset: `0x${string}`;
  payTo: `0x${string}`;
  maxInputBytes: number;
  timeoutMs: number;
  input: {
    summary: string;
    example: unknown;
  };
  fingerprint: string;
}

type DescriptorWithoutFingerprint = Omit<PaidSkillDescriptor, "fingerprint">;

export interface BuildPaidSkillDescriptorOptions {
  origin: string;
}

export function buildPaidSkillDescriptor<TInput, TOutput>(
  skill: DefinedPaidSkill<TInput, TOutput>,
  { origin }: BuildPaidSkillDescriptorOptions,
): PaidSkillDescriptor {
  const normalizedOrigin = validateOrigin(origin);
  if (!SEMVER.test(skill.version) || !isNonZeroAddress(skill.payTo)) {
    throw new Error("INVALID_PAID_SKILL_DESCRIPTOR");
  }

  const network = networkToCaip2(skill.network);
  const descriptorWithoutFingerprint: DescriptorWithoutFingerprint = {
    schemaVersion: SCHEMA_VERSION,
    skillId: skill.name,
    version: skill.version,
    name: skill.name,
    description: skill.description,
    descriptorUrl: `${normalizedOrigin}${WELL_KNOWN_DESCRIPTOR_PATH}`,
    endpoint: `${normalizedOrigin}${skill.endpointPath}`,
    price: {
      amount: skill.price,
      atomicAmount: usdcToAtomic(skill.price).toString(),
      currency: "USDC",
    },
    network,
    asset: USDC_ASSETS[network],
    payTo: skill.payTo,
    maxInputBytes: MAX_PAID_SKILL_REQUEST_BYTES,
    timeoutMs: skill.timeoutMs,
    input: {
      summary: "JSON input accepted by the skill schema.",
      example: roundTripJson(skill.exampleInput),
    },
  };
  const fingerprint = fingerprintPayload(descriptorWithoutFingerprint);

  return { ...descriptorWithoutFingerprint, fingerprint };
}

export function canonicalDescriptorJson(
  descriptor: PaidSkillDescriptor,
): string {
  return canonicalJson(descriptor);
}

export function descriptorFingerprint(descriptor: PaidSkillDescriptor): string {
  const { fingerprint: _ignored, ...withoutFingerprint } = descriptor;
  return fingerprintPayload(withoutFingerprint);
}

export function verifyDescriptorIntegrity(
  descriptor: PaidSkillDescriptor,
): void {
  if (
    descriptor.schemaVersion !== SCHEMA_VERSION ||
    descriptor.fingerprint !== descriptorFingerprint(descriptor)
  ) {
    throw new Error("SKILL_DESCRIPTOR_MISMATCH");
  }
}

export function verifyDescriptorMatchesChallenge(
  descriptor: PaidSkillDescriptor,
  challenge: unknown,
): void {
  verifyDescriptorIntegrity(descriptor);

  if (
    !isRecord(challenge) ||
    challenge.x402Version !== 2 ||
    !isRecord(challenge.resource) ||
    challenge.resource.url !== descriptor.endpoint ||
    !Array.isArray(challenge.accepts) ||
    challenge.accepts.length !== 1
  ) {
    throw new Error("SKILL_DESCRIPTOR_MISMATCH");
  }

  const requirement = challenge.accepts[0];
  if (
    !isRecord(requirement) ||
    requirement.scheme !== "exact" ||
    requirement.network !== descriptor.network ||
    typeof requirement.asset !== "string" ||
    requirement.asset.toLowerCase() !== descriptor.asset.toLowerCase() ||
    requirement.amount !== descriptor.price.atomicAmount ||
    requirement.payTo !== descriptor.payTo
  ) {
    throw new Error("SKILL_DESCRIPTOR_MISMATCH");
  }
}

export function descriptorPath(): typeof WELL_KNOWN_DESCRIPTOR_PATH {
  return WELL_KNOWN_DESCRIPTOR_PATH;
}

function validateOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("INVALID_PAID_SKILL_DESCRIPTOR");
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("INVALID_PAID_SKILL_DESCRIPTOR");
  }

  return url.origin;
}

function networkToCaip2(
  network: SupportedNetwork,
): "eip155:84532" | "eip155:8453" {
  return network === "base-sepolia" ? "eip155:84532" : "eip155:8453";
}

function isNonZeroAddress(value: unknown): value is `0x${string}` {
  return (
    typeof value === "string" &&
    EVM_ADDRESS.test(value) &&
    !ZERO_ADDRESS.test(value)
  );
}

function roundTripJson(value: unknown): unknown {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("invalid");
    return JSON.parse(encoded);
  } catch {
    throw new Error("INVALID_PAID_SKILL_DESCRIPTOR");
  }
}

function fingerprintPayload(value: DescriptorWithoutFingerprint): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJson(value[key])]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
