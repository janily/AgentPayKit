import type { InvocationStatus } from "@agentpaykit/protocol";

export const allowedTransitions = [
  ["QUOTED", "PAYMENT_VERIFIED"],
  ["PAYMENT_VERIFIED", "QUEUED"],
  ["QUEUED", "EXECUTING"],
  ["EXECUTING", "FAILED_NOT_CHARGED"],
  ["SETTLING", "FAILED_NOT_CHARGED"],
  ["EXECUTING", "POLICY_REJECTED"],
  ["EXECUTING", "READY_TO_SETTLE"],
  ["READY_TO_SETTLE", "SETTLING"],
  ["SETTLING", "SETTLEMENT_UNKNOWN"],
  ["SETTLING", "RESULT_AVAILABLE"],
  ["SETTLEMENT_UNKNOWN", "SETTLING"],
  ["SETTLEMENT_UNKNOWN", "RESULT_AVAILABLE"],
  ["SETTLEMENT_UNKNOWN", "FAILED_NOT_CHARGED"],
  ["RESULT_AVAILABLE", "RESULT_EXPIRED"],
] as const satisfies readonly (readonly [InvocationStatus, InvocationStatus])[];

const transitionKeys = new Set(
  allowedTransitions.map(([from, to]) => `${from}:${to}`),
);

export function canTransition(
  from: InvocationStatus,
  to: InvocationStatus,
): boolean {
  return transitionKeys.has(`${from}:${to}`);
}

export function assertTransition(
  from: InvocationStatus,
  to: InvocationStatus,
): void {
  if (!canTransition(from, to))
    throw new Error(`illegal invocation transition ${from} -> ${to}`);
}
