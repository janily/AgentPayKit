import { CliError, type PaymentState } from "./errors";

export interface FailureOutput {
  ok: false;
  error: { code: string; message: string; paymentState: PaymentState };
}

export function successOutput(result: unknown, payment: unknown = null) {
  return { ok: true as const, result, payment };
}

export function errorOutput(error: unknown): FailureOutput {
  const safe =
    error instanceof CliError
      ? error
      : new CliError("UNEXPECTED_ERROR", "not-charged");
  return {
    ok: false,
    error: {
      code: safe.code,
      message: safe.code,
      paymentState: safe.paymentState,
    },
  };
}

export function humanError(error: FailureOutput["error"]): string {
  const warning =
    error.code === "PAYMENT_STATE_UNKNOWN"
      ? " Payment may have settled; do not retry without user confirmation."
      : "";
  const usage =
    error.code === "UNKNOWN_COMMAND"
      ? " Supported commands: call, doctor, wallet disconnect."
      : "";
  return `${error.code}: ${error.message} [${error.paymentState}].${warning}${usage}`;
}

export function humanSuccess(result: unknown, payment: unknown): string {
  const rendered = JSON.stringify(result, null, 2);
  if (payment === null) return rendered;
  const value = payment as { amount: string; transactionHash: string };
  return `${rendered}\nPaid ${value.amount} USDC (${value.transactionHash})`;
}
