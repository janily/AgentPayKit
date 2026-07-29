import { describe, expect, test } from "vitest";

import { CliError } from "../src/errors";
import { errorOutput, humanError, successOutput } from "../src/output";

describe("CLI output", () => {
  test("uses the exact minimal success and failure envelopes", () => {
    expect(successOutput({ answer: 42 }, null)).toEqual({
      ok: true,
      result: { answer: 42 },
      payment: null,
    });
    expect(
      errorOutput(new CliError("USER_REJECTED_PAYMENT", "not-charged")),
    ).toEqual({
      ok: false,
      error: {
        code: "USER_REJECTED_PAYMENT",
        message: "USER_REJECTED_PAYMENT",
        paymentState: "not-charged",
      },
    });
  });

  test("sanitizes attacker-controlled errors and warns against unknown retries", () => {
    expect(
      JSON.stringify(errorOutput(new Error("secret response body"))),
    ).not.toContain("secret");
    expect(
      humanError(
        errorOutput(new CliError("PAYMENT_STATE_UNKNOWN", "unknown")).error,
      ),
    ).toContain("do not retry without user confirmation");
  });
});
