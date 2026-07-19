export const invocationStatuses = [
  "QUOTED",
  "PAYMENT_VERIFIED",
  "QUEUED",
  "EXECUTING",
  "EXECUTION_FAILED",
  "POLICY_REJECTED",
  "READY_TO_SETTLE",
  "SETTLING",
  "SETTLEMENT_UNKNOWN",
  "RESULT_AVAILABLE",
  "RESULT_EXPIRED",
] as const;

export type InvocationStatus = (typeof invocationStatuses)[number];

export const chargeStates = [
  "NOT_CHARGED",
  "CHARGED",
  "SETTLEMENT_UNKNOWN",
] as const;
export type ChargeState = (typeof chargeStates)[number];

export function parseInvocationStatus(value: unknown): InvocationStatus {
  if (!invocationStatuses.includes(value as InvocationStatus)) {
    throw new TypeError(`unknown invocation status: ${String(value)}`);
  }
  return value as InvocationStatus;
}

export function parseChargeState(value: unknown): ChargeState {
  if (!chargeStates.includes(value as ChargeState)) {
    throw new TypeError(`unknown charge state: ${String(value)}`);
  }
  return value as ChargeState;
}
