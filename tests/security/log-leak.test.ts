import { AllowlistedLogger } from "../../packages/observability/src/index";
import { expect, test } from "vitest";

test("structured logs cannot emit input, result, secrets, or payment payload", () => {
  const lines: string[] = [];
  const logger = new AllowlistedLogger((line) => lines.push(line));
  logger.emit({
    timestamp: "2026-07-19T00:00:00.000Z",
    event: "invocation.completed",
    invocationId: "inv_01J00000000000000000000000",
    status: "RESULT_AVAILABLE",
    rawInput: "SENSITIVE_INPUT_MARKER",
    rawResult: "SENSITIVE_RESULT_MARKER",
    paymentPayload: "SENSITIVE_PAYMENT_MARKER",
    privateKey: "SENSITIVE_KEY_MARKER",
  });
  expect(lines).toHaveLength(1);
  expect(lines[0]).not.toMatch(/SENSITIVE_|rawInput|rawResult|paymentPayload/);
});
