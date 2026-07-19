import {
  type InputDigest,
  parseInvocationId,
  parseTraceId,
  type InvocationId,
  type QuoteId,
  type ReleaseId,
  type TraceId,
} from "./ids";
import type { CanonicalSignature, SignedEnvelope } from "./signatures";
import {
  parseChargeState,
  parseInvocationStatus,
  type ChargeState,
  type InvocationStatus,
} from "./status";

export interface StatusEnvelope {
  schemaVersion: "1";
  invocationId: InvocationId;
  status: InvocationStatus;
  chargeState: ChargeState;
  version: number;
  updatedAt: string;
  traceId: TraceId;
}

export interface QuoteEnvelope {
  schemaVersion: "1";
  quoteId: QuoteId;
  invocationId: InvocationId;
  releaseId: ReleaseId;
  inputDigest: InputDigest;
  environment: "testnet" | "mainnet";
  network: "eip155:84532" | "eip155:8453";
  amount: string;
  asset: `0x${string}`;
  payee: `0x${string}`;
  paymentIdentifier: InvocationId;
  issuedAt: string;
  expiresAt: string;
}

export type SignedQuote = SignedEnvelope<QuoteEnvelope>;
export type SignedStatus = SignedEnvelope<StatusEnvelope>;

export interface RuntimeSigner {
  sign(payload: unknown): Promise<CanonicalSignature>;
}

export interface ResultEnvelope {
  schemaVersion: "1";
  invocationId: InvocationId;
  status: "RESULT_AVAILABLE";
  resultDigest: `sha256:${string}`;
  result: unknown;
}

export interface ReceiptEnvelope {
  schemaVersion: "1";
  invocationId: InvocationId;
  releaseId: ReleaseId;
  inputDigest: InputDigest;
  payer: `0x${string}`;
  payee: `0x${string}`;
  network: "eip155:84532" | "eip155:8453";
  asset: `0x${string}`;
  amount: string;
  transactionHash: `0x${string}`;
  executionStartedAt: string;
  executedAt: string;
  settledAt: string;
  resultDigest: `sha256:${string}`;
}

export type SignedReceipt = SignedEnvelope<ReceiptEnvelope>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function assertExactFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new TypeError(`unknown field: ${key}`);
  }
  for (const key of allowed) {
    if (!(key in value)) throw new TypeError(`missing field: ${key}`);
  }
}

function isoTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || new Date(value).toISOString() !== value) {
    throw new TypeError(`${field} must be an ISO timestamp`);
  }
  return value;
}

export function parseStatusEnvelope(value: unknown): StatusEnvelope {
  const input = record(value, "StatusEnvelope");
  assertExactFields(input, [
    "schemaVersion",
    "invocationId",
    "status",
    "chargeState",
    "version",
    "updatedAt",
    "traceId",
  ]);
  if (input.schemaVersion !== "1")
    throw new TypeError("unsupported schemaVersion");
  if (!Number.isSafeInteger(input.version) || (input.version as number) < 0) {
    throw new TypeError("version must be a non-negative safe integer");
  }
  return {
    schemaVersion: "1",
    invocationId: parseInvocationId(input.invocationId),
    status: parseInvocationStatus(input.status),
    chargeState: parseChargeState(input.chargeState),
    version: input.version as number,
    updatedAt: isoTimestamp(input.updatedAt, "updatedAt"),
    traceId: parseTraceId(input.traceId),
  };
}
