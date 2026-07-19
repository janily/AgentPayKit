import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware } from "@x402/hono";
import type { PaymentSettler, PaymentVerifier } from "@agentpaykit/payment";
import { Hono } from "hono";

export interface SpikePaymentPort extends PaymentVerifier, PaymentSettler {}

export interface RuntimeAppOptions {
  payment: SpikePaymentPort;
  paymentRequired: string;
  onHandler?: () => void | Promise<void>;
}

function settlementHeaders(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/**
 * Deterministic M2 compatibility app. It deliberately settles synchronously and
 * is deleted when M3 introduces the asynchronous invocation endpoint.
 */
export function createRuntimeApp({
  payment,
  paymentRequired,
  onHandler,
}: RuntimeAppOptions): Hono {
  const app = new Hono();

  app.get("/health", (context) => context.json({ status: "ok" }));
  app.post("/spike/paid-ping", async (context) => {
    const paymentSignature = context.req.header("PAYMENT-SIGNATURE");
    if (!paymentSignature) {
      return context.json(
        { error: "payment_required", spike: "M2-only" },
        402,
        { "PAYMENT-REQUIRED": paymentRequired },
      );
    }

    const verified = await payment.verify({
      paymentHeader: paymentSignature,
      method: context.req.method,
      url: context.req.url,
    });
    await onHandler?.();
    const settlement = await payment.settle(verified);
    if (!settlement.success) {
      return context.json(
        { error: "settlement_failed", spike: "M2-only" },
        402,
      );
    }

    return context.json(
      { pong: true, spike: "M2-only" },
      200,
      settlementHeaders(settlement.headers),
    );
  });

  return app;
}

export interface OfficialSpikeOptions {
  facilitatorUrl: string;
  network: "eip155:84532" | "eip155:8453";
  payee: `0x${string}`;
  amount: string;
  asset: `0x${string}`;
}

/** Creates the actual official x402/Hono synchronous compatibility spike. */
export function createOfficialSpikeApp(options: OfficialSpikeOptions): Hono {
  const facilitator = new HTTPFacilitatorClient({
    url: options.facilitatorUrl,
  });
  const resourceServer = new x402ResourceServer(facilitator).register(
    options.network,
    new ExactEvmScheme(),
  );
  const app = new Hono();

  app.get("/health", (context) => context.json({ status: "ok" }));
  app.use(
    "/spike/paid-ping",
    paymentMiddleware(
      {
        "POST /spike/paid-ping": {
          accepts: {
            scheme: "exact",
            network: options.network,
            payTo: options.payee,
            price: { amount: options.amount, asset: options.asset },
          },
          description: "M2-only official x402 Workers compatibility ping",
          mimeType: "application/json",
        },
      },
      resourceServer,
    ),
  );
  app.post("/spike/paid-ping", (context) =>
    context.json({ pong: true, spike: "M2-only" }),
  );

  return app;
}
