import {
  createErrorEnvelope,
  parseTraceId,
  type ChargeState,
} from "@agentpaykit/protocol";
import { RuntimeRequestError } from "@agentpaykit/runtime-core";

export function recoveryErrorResponse(
  error: unknown,
  traceId: string,
): Response {
  const runtimeError =
    error instanceof RuntimeRequestError
      ? error
      : new RuntimeRequestError("RECOVERY_REQUEST_FAILED", 400);
  return Response.json(
    createErrorEnvelope({
      code: runtimeError.code,
      message: "Recovery request could not be completed.",
      chargeState: runtimeError.chargeState as ChargeState,
      traceId: parseTraceId(traceId),
    }),
    { status: runtimeError.status },
  );
}
