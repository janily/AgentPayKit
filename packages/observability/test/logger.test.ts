import { describe, expect, test, vi } from "vitest";

import { agentPayLogFields, AllowlistedLogger } from "../src/index";

describe("allowlisted structured logger", () => {
  test("drops secrets, bodies, payloads and arbitrary fields", () => {
    const write = vi.fn();
    const logger = new AllowlistedLogger(write);
    for (let index = 0; index < 100; index += 1) {
      logger.emit({
        timestamp: "2026-07-19T00:00:00.000Z",
        level: "info",
        event: "invocation.completed",
        releaseId: `rel_${"a".repeat(64)}`,
        invocationId: "inv_01J00000000000000000000000",
        status: "RESULT_AVAILABLE",
        durationMs: index,
        amount: "10000",
        network: "eip155:84532",
        errorCode: "NONE",
        traceId: "trc_01J00000000000000000000000",
        privateKey: "forbidden-private-key",
        apiKey: "forbidden-api-key",
        paymentPayload: { secret: true },
        rawInput: "private prompt",
        providerBody: "private response",
        [`random_${index}`]: "arbitrary",
      });
    }
    for (const [line] of write.mock.calls as Array<[string]>) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual([...agentPayLogFields].sort());
      expect(line).not.toMatch(
        /forbidden|private prompt|private response|paymentPayload/,
      );
    }
  });

  test("does not serialize exception messages through approved fields", () => {
    const lines: string[] = [];
    new AllowlistedLogger((line) => lines.push(line)).emit({
      event: new Error("provider response body"),
      errorCode: "UPSTREAM_FAILED",
    });
    expect(lines[0]).toBe('{"errorCode":"UPSTREAM_FAILED"}');
  });
});
