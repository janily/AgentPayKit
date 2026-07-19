import { assertExactFields } from "./envelopes";
import { parseTraceId, type TraceId } from "./ids";
import { parseChargeState, type ChargeState } from "./status";

export interface AgentPayError {
  code: string;
  message: string;
  chargeState: ChargeState;
  traceId: TraceId;
}

export interface ErrorEnvelope {
  schemaVersion: "1";
  error: AgentPayError;
}

export function createErrorEnvelope(error: AgentPayError): ErrorEnvelope {
  return { schemaVersion: "1", error };
}

export function parseErrorEnvelope(value: unknown): ErrorEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("ErrorEnvelope must be an object");
  }
  const envelope = value as Record<string, unknown>;
  assertExactFields(envelope, ["schemaVersion", "error"]);
  if (envelope.schemaVersion !== "1")
    throw new TypeError("unsupported schemaVersion");
  if (
    typeof envelope.error !== "object" ||
    envelope.error === null ||
    Array.isArray(envelope.error)
  ) {
    throw new TypeError("error must be an object");
  }
  const error = envelope.error as Record<string, unknown>;
  assertExactFields(error, ["code", "message", "chargeState", "traceId"]);
  if (typeof error.code !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(error.code)) {
    throw new TypeError("error.code must be a stable uppercase code");
  }
  if (typeof error.message !== "string" || error.message.length === 0) {
    throw new TypeError("error.message must be non-empty");
  }
  return {
    schemaVersion: "1",
    error: {
      code: error.code,
      message: error.message,
      chargeState: parseChargeState(error.chargeState),
      traceId: parseTraceId(error.traceId),
    },
  };
}
