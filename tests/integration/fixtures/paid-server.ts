import { callPaidSkill, type CallResult } from "../../../packages/cli/src/call";
import { NextRequest } from "next/server.js";
import {
  definePaidSkill,
  type PaidSkillConfig,
  type Schema,
} from "../../../packages/server/src/config";
import { createNextPaidSkillRoute } from "../../../packages/server/src/next";

import {
  createCounters,
  createFacilitatorFetch,
  FIXTURE_FACILITATOR_URL,
  type Counters,
} from "./facilitator";
import { createFixtureWallet } from "./wallet";

const ENDPOINT = "https://skill.example/api/invoke";
export const FIXTURE_PAY_TO =
  "0x1111111111111111111111111111111111111111" as const;
const VALID_INPUT = {
  repository: "https://github.com/example/repository",
};

interface Input {
  repository: string;
}

interface Output {
  summary: string;
}

export type FailureScenario =
  "success" | "throw" | "timeout" | "invalid-output" | "unsuccessful";

export interface PaidServerFixtureOptions {
  price?: string;
  scenario?: FailureScenario;
  loseResponseAfterSettlement?: boolean;
}

export interface CallFixtureOptions extends PaidServerFixtureOptions {
  input?: unknown;
  walletRejects?: boolean;
}

export interface PaymentCapture {
  readonly paymentRequired: string | undefined;
  readonly paymentSignature: string | undefined;
  readonly walletPayload: string | undefined;
}

interface MutablePaymentCapture {
  paymentRequired?: string;
  paymentSignature?: string;
  walletPayload?: string;
}

export function createPaidServerFixture(
  options: PaidServerFixtureOptions = {},
): {
  counters: Counters;
  capture: PaymentCapture;
  executionStarted: Promise<void>;
  recordWalletPayment(signature: string, walletPayload: string): void;
  unsignedRequest(input?: unknown): Promise<Response>;
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
} {
  const counters = createCounters();
  const captured: MutablePaymentCapture = {};
  const capture = readonlyCapture(captured);
  const scenario = options.scenario ?? "success";
  let markExecutionStarted!: () => void;
  const executionStarted = new Promise<void>((resolve) => {
    markExecutionStarted = resolve;
  });

  const config: PaidSkillConfig<Input, Output> = {
    name: "fixture-repository-review",
    description: "Deterministic local paid Skill fixture.",
    endpointPath: "/api/invoke",
    price: options.price ?? "0.05",
    network: "base-sepolia",
    payTo: FIXTURE_PAY_TO,
    facilitatorUrl: FIXTURE_FACILITATOR_URL,
    timeoutMs: 1_000,
    exampleInput: VALID_INPUT,
    input: inputSchema,
    output: outputSchema,
    async execute() {
      counters.handlerExecutions += 1;
      markExecutionStarted();
      if (scenario === "throw") throw new Error("FIXTURE_HANDLER_FAILED");
      if (scenario === "timeout") return new Promise(() => undefined);
      if (scenario === "invalid-output") {
        return { summary: 42 } as unknown as Output;
      }
      return { summary: "Reviewed fixture repository" };
    },
    success: scenario === "unsuccessful" ? () => false : undefined,
  };
  const facilitatorFetch = createFacilitatorFetch(counters);
  let POST: ReturnType<typeof createNextPaidSkillRoute>["POST"] | undefined;

  async function fetcher(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const request =
      input instanceof Request
        ? new NextRequest(input)
        : new NextRequest(input.toString(), init);
    const signed = request.headers.has("payment-signature");
    if (signed) {
      counters.signedRequests += 1;
      const signature = request.headers.get("payment-signature");
      if (signature === null) throw new Error("FIXTURE_SIGNATURE_MISSING");
      if (
        captured.paymentSignature !== undefined &&
        captured.paymentSignature !== signature
      ) {
        throw new Error("FIXTURE_SIGNATURE_MISMATCH");
      }
      captured.paymentSignature = signature;
    } else {
      counters.unsignedRequests += 1;
    }

    const previousFetch = globalThis.fetch;
    globalThis.fetch = facilitatorFetch;
    try {
      POST ??= createNextPaidSkillRoute(definePaidSkill(config)).POST;
      const settlesBefore = counters.settleCalls;
      const response = await POST(request);
      if (!signed) {
        const challenge = response.headers.get("payment-required");
        if (challenge !== null) captured.paymentRequired = challenge;
      }
      if (signed && options.loseResponseAfterSettlement) {
        if (counters.settleCalls !== settlesBefore + 1) {
          throw new Error("FIXTURE_EXPECTED_SETTLEMENT");
        }
        throw new TypeError("FIXTURE_RESPONSE_LOST");
      }
      return response;
    } finally {
      globalThis.fetch = previousFetch;
    }
  }

  return {
    counters,
    capture,
    executionStarted,
    recordWalletPayment(signature, walletPayload) {
      if (
        captured.paymentSignature !== undefined &&
        captured.paymentSignature !== signature
      ) {
        throw new Error("FIXTURE_SIGNATURE_MISMATCH");
      }
      captured.paymentSignature = signature;
      captured.walletPayload = walletPayload;
    },
    unsignedRequest(input = VALID_INPUT) {
      return fetcher(ENDPOINT, jsonInit(input));
    },
    fetch: fetcher,
  };
}

export function callFixture(options: CallFixtureOptions = {}): {
  counters: Counters;
  capture: PaymentCapture;
  executionStarted: Promise<void>;
  call(): Promise<CallResult>;
} {
  const server = createPaidServerFixture(options);
  const wallet = createFixtureWallet(
    server.counters,
    options.walletRejects ?? false,
    (signature, walletPayload) => {
      server.recordWalletPayment(signature, walletPayload);
    },
  );

  return {
    counters: server.counters,
    capture: server.capture,
    executionStarted: server.executionStarted,
    call() {
      return callPaidSkill(
        {
          endpoint: ENDPOINT,
          input: options.input ?? VALID_INPUT,
          maxPrice: 200_000n,
          timeoutSeconds: 10,
        },
        {
          fetch: server.fetch,
          ...wallet,
          onPaymentSummary() {},
          onWalletUri() {},
        },
      );
    },
  };
}

function readonlyCapture(value: MutablePaymentCapture): PaymentCapture {
  return {
    get paymentRequired() {
      return value.paymentRequired;
    },
    get paymentSignature() {
      return value.paymentSignature;
    },
    get walletPayload() {
      return value.walletPayload;
    },
  };
}

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
      const url = new URL((value as Input).repository);
      return url.protocol === "https:"
        ? { success: true, data: value as Input }
        : { success: false, error: {} };
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

function jsonInit(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
