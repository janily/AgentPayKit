import {
  parseInvocationId,
  parseTraceId,
  type InvocationId,
  type TraceId,
} from "./ids";
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

export interface ResultEnvelope {
  schemaVersion: "1";
  invocationId: InvocationId;
  status: "RESULT_AVAILABLE";
  resultDigest: `sha256:${string}`;
  result: unknown;
}

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
