import { agentPayLogFields, type AgentPayLogEvent } from "./event";

const validators: Record<
  (typeof agentPayLogFields)[number],
  (value: unknown) => boolean
> = {
  timestamp: (value) =>
    typeof value === "string" && !Number.isNaN(Date.parse(value)),
  level: (value) => value === "info" || value === "warn" || value === "error",
  event: (value) =>
    typeof value === "string" && /^[a-z][a-z0-9_.-]{0,63}$/.test(value),
  releaseId: (value) =>
    typeof value === "string" && /^rel_[0-9a-f]{64}$/.test(value),
  invocationId: (value) =>
    typeof value === "string" && /^inv_[0-9A-HJKMNP-TV-Z]{26}$/.test(value),
  status: (value) =>
    typeof value === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(value),
  durationMs: (value) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0,
  amount: (value) =>
    typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value),
  network: (value) => value === "eip155:84532" || value === "eip155:8453",
  errorCode: (value) =>
    typeof value === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(value),
  traceId: (value) =>
    typeof value === "string" && /^trc_[0-9A-HJKMNP-TV-Z]{26}$/.test(value),
};

export function redactLogEvent(input: unknown): AgentPayLogEvent {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return {};
  const source = input as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const field of agentPayLogFields) {
    if (validators[field](source[field])) output[field] = source[field];
  }
  return output as AgentPayLogEvent;
}
