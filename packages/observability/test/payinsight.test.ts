import { describe, expect, test } from "vitest";

import { aggregatePayInsight } from "../src/index";

const records = [
  {
    releaseId: "rel_a",
    status: "RESULT_AVAILABLE",
    amount: "10000",
    developerReportedCostUsd: 0.1,
    chargeState: "CHARGED" as const,
    occurredAt: "2026-07-19T00:00:00.000Z",
  },
  {
    releaseId: "rel_a",
    status: "SETTLEMENT_UNKNOWN",
    amount: "10000",
    developerReportedCostUsd: 0.2,
    chargeState: "SETTLEMENT_UNKNOWN" as const,
    occurredAt: "2026-07-20T00:00:00.000Z",
  },
  {
    releaseId: "rel_b",
    status: "RESULT_EXPIRED",
    amount: "10000",
    developerReportedCostUsd: 0.1,
    chargeState: "CHARGED" as const,
    occurredAt: "2026-07-21T00:00:00.000Z",
  },
];

describe("PayInsight aggregation", () => {
  test("filters metadata and classifies unknown/expired records", () => {
    expect(aggregatePayInsight({ authorized: true, records })).toEqual({
      invocationCount: 3,
      grossAmount: "30000",
      developerReportedCostUsd: 0.4,
      unknownSettlements: 1,
      resultExpired: 1,
    });
    expect(
      aggregatePayInsight({
        authorized: true,
        records,
        filter: { releaseId: "rel_a" },
      }),
    ).toMatchObject({
      invocationCount: 2,
      grossAmount: "20000",
      resultExpired: 0,
    });
    expect(
      aggregatePayInsight({
        authorized: true,
        records: [],
        filter: { status: "NONE" },
      }),
    ).toMatchObject({ invocationCount: 0, grossAmount: "0" });
  });

  test("refuses unauthenticated publisher access", () => {
    expect(() => aggregatePayInsight({ authorized: false, records })).toThrow(
      "PUBLISHER_IDENTITY_REQUIRED",
    );
  });
});
