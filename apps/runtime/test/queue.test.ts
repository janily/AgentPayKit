import { describe, expect, test, vi } from "vitest";

import { processInvocationBatch } from "../src/queue";

function message(body: unknown) {
  return {
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

describe("Workers Queue adapter", () => {
  test("acks processed and duplicate jobs", async () => {
    const first = message({
      invocationId: "inv_01J00000000000000000000000",
      expectedVersion: 1,
    });
    const second = message({
      invocationId: "inv_01J00000000000000000000001",
      expectedVersion: 1,
    });
    const process = vi
      .fn()
      .mockResolvedValueOnce("processed")
      .mockResolvedValueOnce("duplicate");

    await processInvocationBatch({ messages: [first, second] }, { process });

    expect(first.ack).toHaveBeenCalledOnce();
    expect(second.ack).toHaveBeenCalledOnce();
    expect(first.retry).not.toHaveBeenCalled();
  });

  test("retries transient consumer failures without logging the job body", async () => {
    const queued = message({
      invocationId: "inv_01J00000000000000000000000",
      expectedVersion: 1,
    });
    await processInvocationBatch(
      { messages: [queued] },
      {
        process: vi.fn(async () => Promise.reject(new Error("D1 unavailable"))),
      },
    );
    expect(queued.retry).toHaveBeenCalledOnce();
    expect(queued.ack).not.toHaveBeenCalled();
  });

  test("acks malformed poison messages without invoking runtime", async () => {
    const queued = message({ rawInput: "must-not-enter-runtime" });
    const process = vi.fn();
    await processInvocationBatch({ messages: [queued] }, { process });
    expect(queued.ack).toHaveBeenCalledOnce();
    expect(process).not.toHaveBeenCalled();
  });
});
