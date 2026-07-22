import { describe, expect, it, vi } from "vitest";

import type { CallResult } from "../../packages/cli/src/call";
import type { Counters } from "./fixtures/facilitator";
import { callFixture, type FailureScenario } from "./fixtures/paid-server";

export interface PublisherConformanceFixture {
  counters: Counters;
  executionStarted: Promise<void>;
  call(): Promise<CallResult>;
}

export type PublisherConformanceFactory = (options?: {
  scenario?: FailureScenario;
}) => PublisherConformanceFixture;

export function assertPublisherConformance(
  createFixture: PublisherConformanceFactory,
): void {
  describe("publisher conformance", () => {
    it("settles a successful, schema-valid result exactly once", async () => {
      const success = createFixture();
      await expect(success.call()).resolves.toBeDefined();
      expect(success.counters).toEqual({
        unsignedRequests: 1,
        signedRequests: 1,
        handlerExecutions: 1,
        verifyCalls: 1,
        settleCalls: 1,
        signatureRequests: 1,
      });
    });

    it.each(["throw", "timeout", "invalid-output", "unsuccessful"] as const)(
      "%s verifies and executes once but never settles",
      async (scenario: FailureScenario) => {
        if (scenario === "timeout") vi.useFakeTimers();
        try {
          const fixture = createFixture({ scenario });
          const outcome = fixture.call().then(
            () => ({ resolved: true as const, error: undefined }),
            (error: unknown) => ({ resolved: false as const, error }),
          );
          if (scenario === "timeout") {
            await fixture.executionStarted;
            await vi.advanceTimersByTimeAsync(1_000);
          }

          await expect(outcome).resolves.toMatchObject({
            resolved: false,
            error: {
              code: "SKILL_EXECUTION_FAILED",
              paymentState: "unknown",
            },
          });
          expect(fixture.counters).toEqual({
            unsignedRequests: 1,
            signedRequests: 1,
            handlerExecutions: 1,
            verifyCalls: 1,
            settleCalls: 0,
            signatureRequests: 1,
          });
        } finally {
          if (scenario === "timeout") vi.useRealTimers();
        }
      },
    );
  });
}

assertPublisherConformance(callFixture);
