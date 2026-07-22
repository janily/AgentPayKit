import { describe, expect, it, vi } from "vitest";

import {
  definePaidSkill,
  type PaidSkillConfig,
  type Schema,
} from "../src/config";
import { executePaidSkill } from "../src/execute";

interface Input {
  repository: string;
}

interface Output {
  summary: string;
}

const VALID_INPUT: Input = {
  repository: "https://github.com/openai/openai-node",
};

const inputSchema: Schema<Input> = {
  safeParse(value) {
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as { repository?: unknown }).repository !== "string"
    ) {
      return { success: false, error: {} };
    }

    try {
      return {
        success: true,
        data: { repository: new URL((value as Input).repository).href },
      };
    } catch {
      return { success: false, error: {} };
    }
  },
};

const outputSchema: Schema<Output> = {
  safeParse(value) {
    return typeof value === "object" &&
      value !== null &&
      typeof (value as { summary?: unknown }).summary === "string"
      ? { success: true, data: value as Output }
      : { success: false, error: {} };
  },
};

function createSkill(overrides: Partial<PaidSkillConfig<Input, Output>> = {}) {
  return definePaidSkill({
    name: "paid-repository-review",
    description: "Reviews a public GitHub repository.",
    endpointPath: "/api/invoke",
    price: "0.05",
    network: "base-sepolia",
    payTo: "0x1111111111111111111111111111111111111111",
    timeoutMs: 1_000,
    exampleInput: VALID_INPUT,
    input: inputSchema,
    output: outputSchema,
    async execute() {
      return { summary: "Repository looks healthy." };
    },
    ...overrides,
  });
}

describe("executePaidSkill", () => {
  it("parses input, passes an active AbortSignal, and returns parsed output", async () => {
    const execute = vi.fn(
      async (input: Input, { signal }: { signal: AbortSignal }) => {
        expect(input.repository).toBe(VALID_INPUT.repository);
        expect(signal.aborted).toBe(false);
        return { summary: "Repository looks healthy." };
      },
    );

    await expect(
      executePaidSkill(createSkill({ execute }), VALID_INPUT),
    ).resolves.toEqual({
      summary: "Repository looks healthy.",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input before execution", async () => {
    const execute = vi.fn();

    await expect(
      executePaidSkill(createSkill({ execute }), { repository: "not-a-url" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
    expect(execute).not.toHaveBeenCalled();
  });

  it("maps execution failures to 502", async () => {
    await expect(
      executePaidSkill(
        createSkill({
          async execute() {
            throw new Error("upstream unavailable");
          },
        }),
        VALID_INPUT,
      ),
    ).rejects.toMatchObject({ code: "EXECUTION_FAILED", status: 502 });
  });

  it("aborts timed-out execution and maps it to 504", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;

    try {
      const result = executePaidSkill(
        createSkill({
          execute(_input, context) {
            signal = context.signal;
            return new Promise(() => undefined);
          },
        }),
        VALID_INPUT,
      );
      const rejection = expect(result).rejects.toMatchObject({
        code: "EXECUTION_TIMEOUT",
        status: 504,
      });

      await vi.advanceTimersByTimeAsync(1_000);

      await rejection;
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 504 when execution resolves synchronously from the abort event", async () => {
    vi.useFakeTimers();

    try {
      const result = executePaidSkill(
        createSkill({
          execute(_input, { signal }) {
            return new Promise((resolve) => {
              signal.addEventListener(
                "abort",
                () => resolve({ summary: "resolved during abort" }),
                { once: true },
              );
            });
          },
        }),
        VALID_INPUT,
      );
      const rejection = expect(result).rejects.toMatchObject({
        code: "EXECUTION_TIMEOUT",
        status: 504,
      });

      await vi.advanceTimersByTimeAsync(1_000);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps invalid output to 502", async () => {
    await expect(
      executePaidSkill(
        createSkill({
          async execute() {
            return { summary: 42 } as unknown as Output;
          },
        }),
        VALID_INPUT,
      ),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT", status: 502 });
  });

  it("maps a rejected success policy to 422", async () => {
    await expect(
      executePaidSkill(createSkill({ success: () => false }), VALID_INPUT),
    ).rejects.toMatchObject({ code: "SUCCESS_POLICY_REJECTED", status: 422 });
  });
});
