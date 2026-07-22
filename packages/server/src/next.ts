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

  return {
    async POST(request) {
      const validationError = await validateRequestBeforePayment(
        request,
        skill,
      );
      return validationError ?? paid(request);
    },
  };
}

function networkToCaip2(
  network: SupportedNetwork,
): "eip155:84532" | "eip155:8453" {
  return network === "base-sepolia" ? "eip155:84532" : "eip155:8453";
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
