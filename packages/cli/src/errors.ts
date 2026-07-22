export type PaymentState = "not-charged" | "unknown" | "charged";

export class CliError extends Error {
  readonly code: string;
  readonly paymentState: PaymentState;

  constructor(code: string, paymentState: PaymentState, message = code) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.paymentState = paymentState;
  }
}

export function asCliError(
  error: unknown,
  fallbackCode: string,
  paymentState: PaymentState,
): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof Error && /^[A-Z][A-Z0-9_]*$/.test(error.message)) {
    return new CliError(error.message, paymentState);
  }
  return new CliError(fallbackCode, paymentState);
}
