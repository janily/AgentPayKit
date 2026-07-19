import { describe, expect, test, vi } from "vitest";

import { RuntimeRequestError } from "@agentpaykit/runtime-core";
import { createRecoveryRoutes } from "../src/routes/recovery";

const invocationId = "inv_01J00000000000000000000000";

describe("recovery HTTP routes", () => {
  test("serves signed status, result and receipt envelopes", async () => {
    const recovery = {
      status: vi.fn(async () => ({
        payload: { invocationId, status: "RESULT_AVAILABLE" },
        signature: {},
      })),
      result: vi.fn(async () => ({
        payload: { invocationId, result: { answer: "paid" } },
        signature: {},
      })),
      receipt: vi.fn(async () => ({
        payload: { invocationId, transactionHash: `0x${"f".repeat(64)}` },
        signature: {},
      })),
    };
    const app = createRecoveryRoutes({
      recovery,
      traceId: () => "trc_01J00000000000000000000000",
    });

    for (const endpoint of ["status", "result", "receipt"] as const) {
      const response = await app.request(
        `http://runtime.test/v1/invocations/${invocationId}/${endpoint}`,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        payload: { invocationId },
      });
    }
  });

  test("returns a charge-aware envelope without candidate result on settlement unknown", async () => {
    const recovery = {
      status: vi.fn(),
      result: vi.fn(async () => {
        throw new RuntimeRequestError(
          "RESULT_NOT_AVAILABLE",
          425,
          "SETTLEMENT_UNKNOWN",
        );
      }),
      receipt: vi.fn(),
    };
    const app = createRecoveryRoutes({
      recovery,
      traceId: () => "trc_01J00000000000000000000000",
    });

    const response = await app.request(
      `http://runtime.test/v1/invocations/${invocationId}/result`,
    );
    expect(response.status).toBe(425);
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        code: "RESULT_NOT_AVAILABLE",
        chargeState: "SETTLEMENT_UNKNOWN",
      },
    });
    expect(JSON.stringify(body)).not.toContain("candidate");
  });
});
