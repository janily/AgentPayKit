import {
  assertExactFields,
  createErrorEnvelope,
  parseTraceId,
  type ChargeState,
} from "@agentpaykit/protocol";
import {
  RuntimeRequestError,
  type AcceptInvocationInput,
  type QuoteRequest,
} from "@agentpaykit/runtime-core";
import { Hono } from "hono";

interface InvocationRoutesOptions {
  quote: {
    create(input: QuoteRequest): Promise<{
      quote: unknown;
      signature: unknown;
      paymentRequired: string;
    }>;
  };
  invocation: {
    accept(input: AcceptInvocationInput): Promise<{
      status: unknown;
      replayed: boolean;
    }>;
  };
  traceId(): string;
}

function errorResponse(
  code: string,
  status: number,
  traceId: string,
  chargeState: ChargeState = "NOT_CHARGED",
): Response {
  return Response.json(
    createErrorEnvelope({
      code,
      message: "Request could not be accepted.",
      chargeState,
      traceId: parseTraceId(traceId),
    }),
    { status },
  );
}

export function createInvocationRoutes(options: InvocationRoutesOptions): Hono {
  const app = new Hono();

  app.get("/health", (context) => context.json({ status: "ok" }));
  app.post("/v1/invocations/quote", async (context) => {
    try {
      const request = (await context.req.json()) as QuoteRequest;
      const result = await options.quote.create(request);
      return context.json(
        { quote: result.quote, signature: result.signature },
        402,
        { "PAYMENT-REQUIRED": result.paymentRequired },
      );
    } catch {
      return errorResponse("INVALID_QUOTE_REQUEST", 400, options.traceId());
    }
  });

  app.post("/v1/invocations", async (context) => {
    const paymentHeader = context.req.header("PAYMENT-SIGNATURE");
    if (!paymentHeader) {
      return errorResponse(
        "PAYMENT_SIGNATURE_REQUIRED",
        400,
        options.traceId(),
      );
    }
    try {
      const request = (await context.req.json()) as Omit<
        AcceptInvocationInput,
        "paymentHeader" | "method" | "url"
      >;
      assertExactFields(request as unknown as Record<string, unknown>, [
        "invocationId",
        "quoteId",
        "releaseId",
        "inputDigest",
        "environment",
        "input",
      ]);
      const accepted = await options.invocation.accept({
        ...request,
        paymentHeader,
        method: context.req.method,
        url: context.req.url,
      });
      return context.json(accepted.status, 202, {
        "AGENTPAY-REPLAYED": accepted.replayed ? "true" : "false",
      });
    } catch (error) {
      if (error instanceof RuntimeRequestError) {
        return errorResponse(
          error.code,
          error.status,
          options.traceId(),
          error.chargeState,
        );
      }
      return errorResponse(
        "INVALID_INVOCATION_REQUEST",
        400,
        options.traceId(),
      );
    }
  });

  return app;
}
