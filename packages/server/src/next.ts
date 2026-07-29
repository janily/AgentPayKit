import { createHash } from "node:crypto";

import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { withX402 } from "@x402/next";
import { NextResponse, type NextRequest } from "next/server.js";

import { usdcToAtomic } from "./amount.js";
import {
  MAX_PAID_SKILL_REQUEST_BYTES,
  type DefinedPaidSkill,
  type SupportedNetwork,
} from "./config.js";
import { executePaidSkill, PaidSkillExecutionError } from "./execute.js";

const MAX_RESULT_BYTES = 1024 * 1024;
const MAX_RECENT_PAYMENTS = 1_000;

interface ResponseSnapshot {
  body: ArrayBuffer;
  headers: Headers;
  status: number;
  statusText: string;
}

export function createNextPaidSkillRoute<TInput, TOutput>(
  skill: DefinedPaidSkill<TInput, TOutput>,
): { POST(request: NextRequest): Promise<NextResponse> } {
  void usdcToAtomic(skill.price);

  const network = networkToCaip2(skill.network);
  const facilitator = new HTTPFacilitatorClient({ url: skill.facilitatorUrl });
  const server = new x402ResourceServer(facilitator).register(
    network,
    new ExactEvmScheme(),
  );

  const validatedHandler = async (
    request: NextRequest,
  ): Promise<NextResponse> => {
    let rawInput: unknown;
    try {
      rawInput = await request.json();
    } catch {
      return errorResponse("INVALID_JSON", 400);
    }

    try {
      const result = await executePaidSkill(skill, rawInput);
      const body = JSON.stringify(result);
      if (body === undefined || byteLength(body) > MAX_RESULT_BYTES) {
        return errorResponse("INVALID_OUTPUT", 502);
      }

      return new NextResponse(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (error) {
      if (error instanceof PaidSkillExecutionError) {
        return errorResponse(error.code, error.status);
      }
      return errorResponse("EXECUTION_FAILED", 502);
    }
  };

  const paid = withX402(
    validatedHandler,
    {
      accepts: {
        scheme: "exact",
        price: `$${skill.price}`,
        network,
        payTo: skill.payTo,
      },
      description: skill.description,
      mimeType: "application/json",
    },
    server,
  );
  const inFlightPayments = new Map<string, Promise<ResponseSnapshot>>();
  const recentPayments = new Set<string>();

  return {
    async POST(request) {
      const validationError = await validateRequestBeforePayment(
        request,
        skill,
      );
      if (validationError !== undefined) return validationError;

      const signature = request.headers.get("payment-signature");
      if (signature === null) return paid(request);
      const key = createHash("sha256").update(signature).digest("hex");
      if (recentPayments.has(key)) {
        return errorResponse("PAYMENT_CREDENTIAL_REPLAYED", 409);
      }
      const existing = inFlightPayments.get(key);
      if (existing !== undefined) return responseFromSnapshot(await existing);

      if (recentPayments.size >= MAX_RECENT_PAYMENTS) {
        const oldest = recentPayments.values().next().value;
        if (oldest !== undefined) recentPayments.delete(oldest);
      }
      const execution = snapshotResponse(paid(request));
      inFlightPayments.set(key, execution);
      try {
        const snapshot = await execution;
        recentPayments.add(key);
        return responseFromSnapshot(snapshot);
      } finally {
        inFlightPayments.delete(key);
      }
    },
  };
}

async function snapshotResponse(
  response: Promise<Response>,
): Promise<ResponseSnapshot> {
  const value = await response;
  return {
    body: await value.arrayBuffer(),
    headers: new Headers(value.headers),
    status: value.status,
    statusText: value.statusText,
  };
}

function responseFromSnapshot(snapshot: ResponseSnapshot): Response {
  return new Response(snapshot.body.slice(0), {
    headers: snapshot.headers,
    status: snapshot.status,
    statusText: snapshot.statusText,
  });
}

function networkToCaip2(_network: SupportedNetwork): "eip155:84532" {
  return "eip155:84532";
}

async function validateRequestBeforePayment<TInput, TOutput>(
  request: NextRequest,
  skill: DefinedPaidSkill<TInput, TOutput>,
): Promise<NextResponse | undefined> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return errorResponse("UNSUPPORTED_MEDIA_TYPE", 415);
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await request.clone().arrayBuffer();
  } catch {
    return errorResponse("INVALID_JSON", 400);
  }
  if (bytes.byteLength > MAX_PAID_SKILL_REQUEST_BYTES) {
    return errorResponse("REQUEST_TOO_LARGE", 413);
  }

  let rawInput: unknown;
  try {
    rawInput = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return errorResponse("INVALID_JSON", 400);
  }

  try {
    if (!skill.input.safeParse(rawInput).success) {
      return errorResponse("INVALID_INPUT", 400);
    }
  } catch {
    return errorResponse("INVALID_INPUT", 400);
  }

  return undefined;
}

function isJsonContentType(contentType: string | null): boolean {
  return (
    contentType?.split(";", 1)[0].trim().toLowerCase() === "application/json"
  );
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function errorResponse(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}
