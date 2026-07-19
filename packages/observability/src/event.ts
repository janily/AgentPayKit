export interface AgentPayLogEvent {
  timestamp?: string;
  level?: "info" | "warn" | "error";
  event?: string;
  releaseId?: string;
  invocationId?: string;
  status?: string;
  durationMs?: number;
  amount?: string;
  network?: "eip155:84532" | "eip155:8453";
  errorCode?: string;
  traceId?: string;
}

export const agentPayLogFields = [
  "timestamp",
  "level",
  "event",
  "releaseId",
  "invocationId",
  "status",
  "durationMs",
  "amount",
  "network",
  "errorCode",
  "traceId",
] as const;
