import { describe, expect, test } from "vitest";

import { errorOutput, successOutput } from "../src/output";

describe("CLI output", () => {
  test("serializes stable success and error envelopes", () => {
    expect(successOutput("spend", { spent: "10" })).toEqual({
      schemaVersion: "1",
      ok: true,
      command: "spend",
      data: { spent: "10" },
    });
    expect(errorOutput("resume", new Error("boom"))).toEqual({
      schemaVersion: "1",
      ok: false,
      command: "resume",
      error: {
        code: "UNEXPECTED_ERROR",
        message: "boom",
        chargeState: "SETTLEMENT_UNKNOWN",
      },
    });
    expect(errorOutput("spend", new Error("missing policy"))).toMatchObject({
      error: { chargeState: "NOT_CHARGED" },
    });
  });
});
