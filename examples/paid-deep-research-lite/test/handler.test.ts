import { describe, expect, test, vi } from "vitest";

import {
  BoundedResearchHandler,
  ResearchBudget,
  safeRetry,
} from "../src/index";

function fixture(overrides: Record<string, unknown> = {}) {
  return new BoundedResearchHandler({
    search: {
      processor: "search.example",
      search: vi.fn(async () =>
        Array.from({ length: 8 }, (_, index) => ({
          url: `https://source.test/${index}`,
          title: `Source ${index}`,
        })),
      ),
      fetchPage: vi.fn(async () => "page text"),
    },
    model: {
      processor: "model.example",
      generate: vi.fn(async () => ({
        report: "x".repeat(500),
        citations: ["https://source.test/1", "https://source.test/2"],
        outputTokens: 3_000,
        costUsd: 0.5,
      })),
    },
    allowedProcessors: ["search.example", "model.example"],
    ...overrides,
  } as never);
}

describe("bounded research handler", () => {
  test("enforces 5 pages, 3000 tokens and records developer-reported cost", async () => {
    await expect(
      fixture().execute({ query: "bounded topic" }),
    ).resolves.toMatchObject({
      telemetry: {
        searches: 1,
        pages: 5,
        outputTokens: 3_000,
        developerReportedCostUsd: 0.5,
      },
    });
  });

  test("classifies input, processor, body, cost and timeout violations", async () => {
    await expect(fixture().execute({ query: "" })).rejects.toMatchObject({
      code: "INVALID_RESEARCH_INPUT",
    });
    await expect(
      fixture({ allowedProcessors: ["search.example"] }).execute({
        query: "x",
      }),
    ).rejects.toMatchObject({ code: "UNDECLARED_PROCESSOR" });
    await expect(
      fixture().execute({ query: "x".repeat(40_000) }),
    ).rejects.toMatchObject({
      code: "INVALID_RESEARCH_INPUT",
    });

    const cost = new ResearchBudget(0, () => 0);
    expect(() => cost.complete(1, 0.51)).toThrow(
      "DEVELOPER_REPORTED_COST_CAP_EXCEEDED",
    );
    const timeout = new ResearchBudget(0, () => 300_001);
    expect(() => timeout.search()).toThrow("HANDLER_TIMEOUT");
  });

  test("retries idempotent provider calls at most once", async () => {
    const succeeds = vi
      .fn()
      .mockRejectedValueOnce(new Error())
      .mockResolvedValueOnce("ok");
    await expect(safeRetry(succeeds)).resolves.toBe("ok");
    expect(succeeds).toHaveBeenCalledTimes(2);
    const fails = vi.fn().mockRejectedValue(new Error());
    await expect(safeRetry(fails)).rejects.toMatchObject({
      code: "PROVIDER_REQUEST_FAILED",
    });
    expect(fails).toHaveBeenCalledTimes(2);
  });
});
