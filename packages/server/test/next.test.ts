import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type { PaymentPayload } from "@x402/core/types";
import { NextRequest } from "next/server.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  definePaidSkill,
  type PaidSkillConfig,
  type Schema,
} from "../src/config";
import { createNextPaidSkillRoute } from "../src/next";

interface Input {
  repository: string;
}

interface Output {
  summary: string;
}

const VALID_INPUT: Input = {
  repository: "https://github.com/openai/openai-node",
};
const PAYER = "0x2222222222222222222222222222222222222222";

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
      new URL((value as Input).repository);
      return { success: true, data: value as Input };
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

function jsonRequest(body: unknown, paymentSignature?: string): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
  };
  if (paymentSignature !== undefined) {
    headers["payment-signature"] = paymentSignature;
  }

  return new NextRequest("https://skill.example/api/invoke", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function facilitatorCalls(path: string): number {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([input]) =>
      new URL(String(input)).pathname.endsWith(path),
    ).length;
}

async function paidPost(
  POST: (request: NextRequest) => Promise<Response>,
  body: unknown,
): Promise<Response> {
  const unpaid = await POST(jsonRequest(body));
  expect(unpaid.status).toBe(402);

  const header = unpaid.headers.get("payment-required");
  expect(header).not.toBeNull();
  const challenge = decodePaymentRequiredHeader(header!);
  if (challenge.x402Version !== 2) {
    throw new Error("Expected an x402 v2 challenge");
  }

  const payload: PaymentPayload = {
    x402Version: 2,
    resource: challenge.resource,
    accepted: challenge.accepts[0],
    payload: { signature: "0x01", authorization: {} },
  };

  return POST(jsonRequest(body, encodePaymentSignatureHeader(payload)));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/supported")) {
        return Response.json({
          kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532" }],
          extensions: [],
          signers: {},
        });
      }
      if (path.endsWith("/verify")) {
        return Response.json({ isValid: true, payer: PAYER });
      }
      if (path.endsWith("/settle")) {
        return Response.json({
          success: true,
          payer: PAYER,
          transaction: "0xabc",
          network: "eip155:84532",
        });
      }
      throw new Error(`Unexpected facilitator request: ${String(input)}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("createNextPaidSkillRoute", () => {
  it("cannot replace official withX402 through an extra public argument", async () => {
    const replacement = vi.fn();

    const route = (
      createNextPaidSkillRoute as unknown as (
        ...args: unknown[]
      ) => ReturnType<typeof createNextPaidSkillRoute>
    )(createSkill(), { withX402: replacement });

    const response = await route.POST(jsonRequest(VALID_INPUT));
    expect(replacement).not.toHaveBeenCalled();
    expect(response.status).toBe(402);
  });

  it("composes the exact route config through official withX402", async () => {
    const skill = createSkill();
    const route = createNextPaidSkillRoute(skill);

    const response = await route.POST(jsonRequest(VALID_INPUT));
    const challenge = decodePaymentRequiredHeader(
      response.headers.get("payment-required")!,
    );
    expect(response.status).toBe(402);
    expect(challenge.resource).toMatchObject({
      url: "https://skill.example/api/invoke",
      description: skill.description,
      mimeType: "application/json",
    });
    expect(challenge.accepts).toEqual([
      expect.objectContaining({
        scheme: "exact",
        network: "eip155:84532",
        amount: "50000",
        payTo: skill.payTo,
      }),
    ]);
  });

  it.each([
    ["execute throws", "execute-throws", 502],
    ["invalid output", "invalid-output", 502],
    ["success policy rejects", "success-rejects", 422],
    ["success policy throws", "success-throws", 502],
  ] as const)(
    "official withX402 settles zero times when %s",
    async (_name, failure, status) => {
      const overrides: Partial<PaidSkillConfig<Input, Output>> = {};
      if (failure === "execute-throws") {
        overrides.execute = async () => {
          throw new Error("upstream unavailable");
        };
      } else if (failure === "invalid-output") {
        overrides.execute = async () => ({ summary: 42 }) as unknown as Output;
      } else if (failure === "success-rejects") {
        overrides.success = () => false;
      } else {
        overrides.success = () => {
          throw new Error("policy crashed");
        };
      }
      const { POST } = createNextPaidSkillRoute(createSkill(overrides));

      const response = await paidPost(POST, VALID_INPUT);

      expect(response.status).toBe(status);
      expect(facilitatorCalls("/verify")).toBe(1);
      expect(facilitatorCalls("/settle")).toBe(0);
    },
  );

  it("official withX402 settles zero times on timeout", async () => {
    vi.useFakeTimers();
    let started!: () => void;
    const executionStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const { POST } = createNextPaidSkillRoute(
      createSkill({
        execute() {
          started();
          return new Promise(() => undefined);
        },
      }),
    );
    const unpaid = await POST(jsonRequest(VALID_INPUT));
    const header = unpaid.headers.get("payment-required")!;
    const challenge = decodePaymentRequiredHeader(header);
    if (challenge.x402Version !== 2) {
      throw new Error("Expected an x402 v2 challenge");
    }
    const paymentSignature = encodePaymentSignatureHeader({
      x402Version: 2,
      resource: challenge.resource,
      accepted: challenge.accepts[0],
      payload: {},
    });

    const responsePromise = POST(jsonRequest(VALID_INPUT, paymentSignature));
    await executionStarted;
    await vi.advanceTimersByTimeAsync(1_000);
    const response = await responsePromise;

    expect(response.status).toBe(504);
    expect(facilitatorCalls("/settle")).toBe(0);
  });

  it("rejects invalid input before official withX402 and settlement", async () => {
    const { POST } = createNextPaidSkillRoute(createSkill());

    const response = await POST(jsonRequest({ repository: "not-a-url" }));

    expect(response.status).toBe(400);
    expect(facilitatorCalls("/verify")).toBe(0);
    expect(facilitatorCalls("/settle")).toBe(0);
  });

  it("rejects non-JSON content before official withX402", async () => {
    const { POST } = createNextPaidSkillRoute(createSkill());
    const request = new NextRequest("https://skill.example/api/invoke", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(VALID_INPUT),
    });

    const response = await POST(request);

    expect(response.status).toBe(415);
    expect(facilitatorCalls("/verify")).toBe(0);
    expect(facilitatorCalls("/settle")).toBe(0);
  });

  it("rejects malformed JSON before official withX402", async () => {
    const { POST } = createNextPaidSkillRoute(createSkill());
    const request = new NextRequest("https://skill.example/api/invoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(facilitatorCalls("/settle")).toBe(0);
  });

  it("rejects request bodies larger than 32 KiB before official withX402", async () => {
    const { POST } = createNextPaidSkillRoute(createSkill());

    const response = await POST(
      jsonRequest({
        repository: `https://example.com/${"a".repeat(32 * 1024)}`,
      }),
    );

    expect(response.status).toBe(413);
    expect(facilitatorCalls("/settle")).toBe(0);
  });

  it("official withX402 settles zero times for a result over 1 MiB", async () => {
    const { POST } = createNextPaidSkillRoute(
      createSkill({
        async execute() {
          return { summary: "a".repeat(1024 * 1024) };
        },
      }),
    );

    const response = await paidPost(POST, VALID_INPUT);

    expect(response.status).toBe(502);
    expect(facilitatorCalls("/settle")).toBe(0);
  });

  it("official withX402 executes once and settles exactly once on success", async () => {
    const execute = vi.fn(async (input: Input) => ({
      summary: `Reviewed ${input.repository}`,
    }));
    const { POST } = createNextPaidSkillRoute(createSkill({ execute }));

    const response = await paidPost(POST, VALID_INPUT);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      summary: `Reviewed ${VALID_INPUT.repository}`,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(facilitatorCalls("/verify")).toBe(1);
    expect(facilitatorCalls("/settle")).toBe(1);
  });

  it("coalesces repeated use of the same payment credential", async () => {
    const execute = vi.fn(async () => ({ summary: "Reviewed once" }));
    const { POST } = createNextPaidSkillRoute(createSkill({ execute }));
    const unpaid = await POST(jsonRequest(VALID_INPUT));
    const challenge = decodePaymentRequiredHeader(
      unpaid.headers.get("payment-required")!,
    );
    if (challenge.x402Version !== 2) throw new Error("Expected x402 v2");
    const signature = encodePaymentSignatureHeader({
      x402Version: 2,
      resource: challenge.resource,
      accepted: challenge.accepts[0],
      payload: { signature: "0x01", authorization: {} },
    });

    const first = POST(jsonRequest(VALID_INPUT, signature));
    const second = POST(jsonRequest(VALID_INPUT, signature));
    const responses = await Promise.all([first, second]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(facilitatorCalls("/verify")).toBe(1);
    expect(facilitatorCalls("/settle")).toBe(1);

    const replay = await POST(jsonRequest(VALID_INPUT, signature));
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toEqual({
      error: "PAYMENT_CREDENTIAL_REPLAYED",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
