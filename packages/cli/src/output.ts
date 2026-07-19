import type { ChargeState } from "@agentpaykit/protocol";

export type CliCommand =
  | "invoke"
  | "status"
  | "resume"
  | "spend"
  | "create"
  | "install"
  | "doctor"
  | "release"
  | "unknown";

export interface CliFailure {
  code: string;
  message: string;
  chargeState: ChargeState;
  invocationId?: string;
  resumeCommand?: string;
}

const chargedCodes = new Set(["RESULT_EXPIRED"]);
const uncertainCodes = new Set([
  "INVOCATION_PENDING",
  "SETTLE_TIMEOUT",
  "SETTLEMENT_TIMEOUT",
  "SETTLEMENT_UNKNOWN",
  "RUNTIME_HTTP_500",
  "RUNTIME_HTTP_502",
  "RUNTIME_HTTP_503",
  "RUNTIME_HTTP_504",
]);

function errorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z][A-Z0-9_]*$/.test(error.code)
  ) {
    return error.code;
  }
  return "UNEXPECTED_ERROR";
}

function errorMessage(error: unknown, code: string): string {
  if (error instanceof Error && error.message) return error.message;
  return code;
}

function invocationId(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("handle" in error)) {
    return undefined;
  }
  const handle = error.handle;
  if (
    typeof handle === "object" &&
    handle !== null &&
    "invocationId" in handle &&
    typeof handle.invocationId === "string"
  ) {
    return handle.invocationId;
  }
  return undefined;
}

export function chargeStateFor(error: unknown): ChargeState {
  if (
    typeof error === "object" &&
    error !== null &&
    "chargeState" in error &&
    (error.chargeState === "NOT_CHARGED" ||
      error.chargeState === "CHARGED" ||
      error.chargeState === "SETTLEMENT_UNKNOWN")
  ) {
    return error.chargeState;
  }
  const code = errorCode(error);
  if (chargedCodes.has(code)) return "CHARGED";
  if (uncertainCodes.has(code) || code === "UNEXPECTED_ERROR") {
    return "SETTLEMENT_UNKNOWN";
  }
  return "NOT_CHARGED";
}

export function successOutput(command: CliCommand, data: unknown) {
  return { schemaVersion: "1" as const, ok: true as const, command, data };
}

export function errorOutput(command: CliCommand, error: unknown) {
  const code = errorCode(error);
  const id = invocationId(error);
  const failure: CliFailure = {
    code,
    message: errorMessage(error, code),
    chargeState: command === "spend" ? "NOT_CHARGED" : chargeStateFor(error),
    ...(id ? { invocationId: id, resumeCommand: `agentpay resume ${id}` } : {}),
  };
  return {
    schemaVersion: "1" as const,
    ok: false as const,
    command,
    error: failure,
  };
}

export function humanError(error: CliFailure): string {
  const lines = [`${error.code}: ${error.message} (${error.chargeState})`];
  if (error.resumeCommand) lines.push(`Resume: ${error.resumeCommand}`);
  return lines.join("\n");
}
