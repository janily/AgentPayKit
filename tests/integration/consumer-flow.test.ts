import { describe, expect, it } from "vitest";

import { errorOutput, humanError } from "../../packages/cli/src/output";
import { CliError } from "../../packages/cli/src/errors";
import { FIXTURE_PAY_TO } from "./fixtures/paid-server";
import { callFixture } from "./fixtures/paid-server";

describe("local paid Skill consumer flow", () => {
  it("executes and settles exactly once on paid success", async () => {
    const fixture = callFixture();

    await expect(fixture.call()).resolves.toMatchObject({
      result: { summary: "Reviewed fixture repository" },
      payment: {
        amount: "0.05",
        currency: "USDC",
        network: "eip155:84532",
        payTo: FIXTURE_PAY_TO,
        transactionHash: `0x${"a".repeat(64)}`,
      },
    });
    expect(fixture.counters).toEqual({
      unsignedRequests: 1,
      signedRequests: 1,
      handlerExecutions: 1,
      verifyCalls: 1,
      settleCalls: 1,
      signatureRequests: 1,
    });
  });

  it("rejects bad input before challenge, wallet, execution, verification, or settlement", async () => {
    const fixture = callFixture({ input: { repository: "not-a-url" } });

    await expect(fixture.call()).rejects.toMatchObject({
      code: "ENDPOINT_REQUEST_FAILED",
      paymentState: "not-charged",
    });
    expect(fixture.counters).toEqual({
      unsignedRequests: 1,
      signedRequests: 0,
      handlerExecutions: 0,
      verifyCalls: 0,
      settleCalls: 0,
      signatureRequests: 0,
    });
  });

  it("does not send a signed request when the wallet rejects", async () => {
    const fixture = callFixture({ walletRejects: true });

    await expect(fixture.call()).rejects.toMatchObject({
      code: "PAYMENT_REJECTED",
      paymentState: "not-charged",
    });
    expect(fixture.counters).toEqual({
      unsignedRequests: 1,
      signedRequests: 0,
      handlerExecutions: 0,
      verifyCalls: 0,
      settleCalls: 0,
      signatureRequests: 1,
    });
  });

  it("maps response loss after settlement to unknown without retrying", async () => {
    const fixture = callFixture({ loseResponseAfterSettlement: true });

    await expect(fixture.call()).rejects.toMatchObject({
      code: "PAYMENT_STATE_UNKNOWN",
      paymentState: "unknown",
    });
    expect(fixture.counters).toEqual({
      unsignedRequests: 1,
      signedRequests: 1,
      handlerExecutions: 1,
      verifyCalls: 1,
      settleCalls: 1,
      signatureRequests: 1,
    });
  });

  it.each([
    ["handler throw", { scenario: "throw" as const }, true],
    ["response loss", { loseResponseAfterSettlement: true }, true],
    ["wallet rejection", { walletRejects: true }, false],
  ])(
    "%s keeps the actual payment headers and decoded wallet payload private",
    async (_name, options, expectsSignature) => {
      const fixture = callFixture(options);
      let thrown: unknown;
      try {
        await fixture.call();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeDefined();
      expect(fixture.capture.paymentRequired).toEqual(expect.any(String));
      if (expectsSignature) {
        expect(fixture.capture.paymentSignature).toEqual(expect.any(String));
        expect(fixture.capture.walletPayload).toEqual(expect.any(String));
      } else {
        expect(fixture.capture.paymentSignature).toBeUndefined();
        expect(fixture.capture.walletPayload).toBeUndefined();
      }

      const cliError = thrown as CliError;
      const serializedError = JSON.stringify(thrown);
      const safeJsonOutput = JSON.stringify(errorOutput(thrown));
      const safeHumanOutput = humanError(errorOutput(cliError).error);
      for (const sensitive of [
        fixture.capture.paymentRequired,
        fixture.capture.paymentSignature,
        fixture.capture.walletPayload,
      ].filter((value): value is string => value !== undefined)) {
        expect(sensitive.length).toBeGreaterThan(10);
        expect(String(thrown)).not.toContain(sensitive);
        expect(serializedError).not.toContain(sensitive);
        expect(safeJsonOutput).not.toContain(sensitive);
        expect(safeHumanOutput).not.toContain(sensitive);
      }
    },
  );
});
