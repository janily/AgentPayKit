export type SuccessPolicyDecision =
  { accepted: true } | { accepted: false; errorCode: string };

export class SuccessPolicy {
  constructor(
    private readonly outputSchema: (candidate: unknown) => boolean,
    private readonly evaluatePolicy: (
      candidate: unknown,
    ) => Promise<SuccessPolicyDecision> | SuccessPolicyDecision,
  ) {}

  async evaluate(candidate: unknown): Promise<SuccessPolicyDecision> {
    if (!this.outputSchema(candidate)) {
      return { accepted: false, errorCode: "OUTPUT_SCHEMA_INVALID" };
    }
    return this.evaluatePolicy(candidate);
  }
}
