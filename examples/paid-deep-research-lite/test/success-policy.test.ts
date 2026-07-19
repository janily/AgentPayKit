import { describe, expect, test, vi } from "vitest";

import {
  evaluateResearchSuccess,
  settleSuccessfulResearch,
} from "../src/index";

function valid() {
  return {
    report: "x".repeat(500),
    citations: ["https://source.test/a", "https://source.test/b"],
    telemetry: {
      searches: 5,
      pages: 5,
      outputTokens: 3_000,
      durationMs: 300_000,
      developerReportedCostUsd: 0.5,
      processors: ["search.example", "model.example"],
    },
  };
}

describe("research success policy", () => {
  test.each([
    ["499 chars", { ...valid(), report: "x".repeat(499) }, "REPORT_TOO_SHORT"],
    [
      "one citation",
      { ...valid(), citations: ["https://source.test/a"] },
      "INSUFFICIENT_CITATIONS",
    ],
    [
      "duplicate citation",
      {
        ...valid(),
        citations: ["https://source.test/a", "https://source.test/a"],
      },
      "INSUFFICIENT_CITATIONS",
    ],
    [
      "http citation",
      {
        ...valid(),
        citations: ["http://source.test/a", "https://source.test/b"],
      },
      "INVALID_CITATION",
    ],
    ["schema error", { report: "x".repeat(500) }, "INVALID_OUTPUT_SCHEMA"],
    [
      "cap violation",
      { ...valid(), telemetry: { ...valid().telemetry, pages: 6 } },
      "HARD_CAP_VIOLATION",
    ],
  ])("rejects %s without exposing body", async (_label, sample, reason) => {
    const settle = vi.fn();
    await expect(settleSuccessfulResearch(sample, settle)).resolves.toEqual({
      success: false,
      reason,
    });
    expect(settle).not.toHaveBeenCalled();
  });

  test("accepts exact boundaries and settles once", async () => {
    expect(evaluateResearchSuccess(valid())).toEqual({
      success: true,
      reason: "SUCCESS",
    });
    const settle = vi.fn(async () => undefined);
    await settleSuccessfulResearch(valid(), settle);
    expect(settle).toHaveBeenCalledTimes(1);
  });
});
