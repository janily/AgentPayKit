export interface Counters {
  unsignedRequests: number;
  signedRequests: number;
  handlerExecutions: number;
  verifyCalls: number;
  settleCalls: number;
  signatureRequests: number;
}

export const FIXTURE_PAYER =
  "0x2222222222222222222222222222222222222222" as const;
export const FIXTURE_TRANSACTION = `0x${"a".repeat(64)}` as const;
export const FIXTURE_FACILITATOR_URL = "https://fixture.facilitator";

export function createCounters(): Counters {
  return {
    unsignedRequests: 0,
    signedRequests: 0,
    handlerExecutions: 0,
    verifyCalls: 0,
    settleCalls: 0,
    signatureRequests: 0,
  };
}

export function createFacilitatorFetch(counters: Counters): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;

    if (url.origin !== FIXTURE_FACILITATOR_URL) {
      throw new Error("UNEXPECTED_FACILITATOR_ORIGIN");
    }

    if (path === "/supported") {
      if (request.method !== "GET") {
        throw new Error("UNEXPECTED_FACILITATOR_METHOD");
      }
      return Response.json({
        kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532" }],
        extensions: [],
        signers: {},
      });
    }

    if (path !== "/verify" && path !== "/settle") {
      throw new Error("UNEXPECTED_FACILITATOR_REQUEST");
    }
    if (request.method !== "POST") {
      throw new Error("UNEXPECTED_FACILITATOR_METHOD");
    }

    const body = await request.json();
    assertFixturePayment(body);

    if (path === "/verify") {
      counters.verifyCalls += 1;
      return Response.json({ isValid: true, payer: FIXTURE_PAYER });
    }

    counters.settleCalls += 1;
    return Response.json({
      success: true,
      payer: FIXTURE_PAYER,
      transaction: FIXTURE_TRANSACTION,
      network: "eip155:84532",
      amount: paymentAmount(body),
    });
  };
}

function assertFixturePayment(body: unknown): asserts body is {
  x402Version: number;
  paymentPayload: {
    payload: { fixture: string };
    accepted: Record<string, unknown>;
  };
  paymentRequirements: Record<string, unknown> & { amount: string };
} {
  if (
    !isRecord(body) ||
    body.x402Version !== 2 ||
    !isRecord(body.paymentPayload) ||
    body.paymentPayload.x402Version !== 2 ||
    !isRecord(body.paymentPayload.payload) ||
    body.paymentPayload.payload.fixture !== "agentpaykit-local" ||
    !isRecord(body.paymentPayload.accepted) ||
    !isRecord(body.paymentRequirements) ||
    typeof body.paymentRequirements.amount !== "string" ||
    body.paymentPayload.accepted.scheme !== body.paymentRequirements.scheme ||
    body.paymentPayload.accepted.network !== body.paymentRequirements.network ||
    body.paymentPayload.accepted.asset !== body.paymentRequirements.asset ||
    body.paymentPayload.accepted.amount !== body.paymentRequirements.amount ||
    body.paymentPayload.accepted.payTo !== body.paymentRequirements.payTo
  ) {
    throw new Error("INVALID_FIXTURE_PAYMENT");
  }
}

function paymentAmount(body: {
  paymentRequirements: { amount: string };
}): string {
  return body.paymentRequirements.amount;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
