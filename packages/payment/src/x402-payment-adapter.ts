import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  type HTTPAdapter,
} from "@x402/core/http";
import { x402ResourceServer } from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  PAYMENT_IDENTIFIER,
  declarePaymentIdentifierExtension,
  paymentIdentifierResourceServerExtension,
} from "@x402/extensions/payment-identifier";

import type { PaymentConfig } from "./config";
import type {
  JsonObject,
  PaymentSettler,
  PaymentVerifier,
  ReconcilePaymentInput,
  SettlePaymentInput,
  SettlementResult,
  SettlementState,
  VerifiedPayment,
  VerifyPaymentInput,
} from "./types";

interface ResourceServerPort {
  processHTTPRequest(input: VerifyPaymentInput): Promise<
    | {
        type: "payment-verified";
        paymentPayload: JsonObject;
        paymentRequirements: JsonObject;
        declaredExtensions?: JsonObject;
      }
    | { type: "no-payment-required" }
    | {
        type: "payment-error";
        response: {
          status: number;
          headers: Record<string, string>;
          body?: unknown;
        };
      }
  >;
  processSettlement(input: SettlePaymentInput): Promise<SettlementResult>;
}

function toJsonObject(value: unknown): JsonObject {
  const serialized = JSON.stringify(value, (_key, nestedValue: unknown) =>
    typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
  );
  const parsed: unknown = JSON.parse(serialized);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("official x402 value was not a serializable object");
  }
  return parsed as JsonObject;
}

export class X402PaymentAdapter implements PaymentVerifier, PaymentSettler {
  constructor(private readonly resourceServer: ResourceServerPort) {}

  async verify(input: VerifyPaymentInput): Promise<VerifiedPayment> {
    const result = await this.resourceServer.processHTTPRequest(input);
    if (result.type !== "payment-verified") {
      const status =
        result.type === "payment-error" ? result.response.status : 500;
      throw new Error(
        `x402 verification did not produce a verified payment (${status})`,
      );
    }

    return {
      paymentPayload: result.paymentPayload,
      paymentRequirements: result.paymentRequirements,
      ...(result.declaredExtensions
        ? { declaredExtensions: result.declaredExtensions }
        : {}),
    };
  }

  settle(input: SettlePaymentInput): Promise<SettlementResult> {
    return this.resourceServer.processSettlement(input);
  }

  async reconcile(_input: ReconcilePaymentInput): Promise<SettlementState> {
    return "SETTLEMENT_UNKNOWN";
  }
}

class RequestAdapter implements HTTPAdapter {
  private readonly parsedUrl: URL;

  constructor(private readonly input: VerifyPaymentInput) {
    this.parsedUrl = new URL(input.url);
  }

  getHeader(name: string): string | undefined {
    return name.toLowerCase() === "payment-signature"
      ? this.input.paymentHeader
      : undefined;
  }

  getMethod(): string {
    return this.input.method.toUpperCase();
  }

  getPath(): string {
    return this.parsedUrl.pathname;
  }

  getUrl(): string {
    return this.parsedUrl.toString();
  }

  getAcceptHeader(): string {
    return "application/json";
  }

  getUserAgent(): string {
    return "agentpaykit-runtime";
  }
}

export interface OfficialPaymentAdapterOptions {
  config: PaymentConfig;
  method: string;
  path: string;
  createAuthHeaders?: () => Promise<{
    verify: Record<string, string>;
    settle: Record<string, string>;
    supported: Record<string, string>;
  }>;
}

export async function createOfficialPaymentAdapter({
  config,
  method,
  path,
  createAuthHeaders,
}: OfficialPaymentAdapterOptions): Promise<X402PaymentAdapter> {
  const facilitator = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
    ...(createAuthHeaders ? { createAuthHeaders } : {}),
  });
  const coreServer = new x402ResourceServer(facilitator)
    .register(config.network, new ExactEvmScheme())
    .registerExtension(paymentIdentifierResourceServerExtension);
  const httpServer = new x402HTTPResourceServer(coreServer, {
    [`${method.toUpperCase()} ${path}`]: {
      accepts: {
        scheme: "exact",
        network: config.network,
        payTo: config.payee,
        price: { amount: config.amount, asset: config.asset },
      },
      description: "AgentPayKit paid invocation",
      mimeType: "application/json",
      extensions: {
        [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true),
      },
    },
  });
  await httpServer.initialize();

  return new X402PaymentAdapter({
    async processHTTPRequest(input) {
      const result = await httpServer.processHTTPRequest({
        adapter: new RequestAdapter(input),
        path: new URL(input.url).pathname,
        method: input.method.toUpperCase(),
        paymentHeader: input.paymentHeader,
      });
      if (result.type !== "payment-verified") return result;
      return {
        type: result.type,
        paymentPayload: toJsonObject(result.paymentPayload),
        paymentRequirements: toJsonObject(result.paymentRequirements),
        ...(result.declaredExtensions
          ? { declaredExtensions: toJsonObject(result.declaredExtensions) }
          : {}),
      };
    },
    async processSettlement(input) {
      const result = await httpServer.processSettlement(
        input.paymentPayload as unknown as PaymentPayload,
        input.paymentRequirements as unknown as PaymentRequirements,
        input.declaredExtensions,
      );
      return { ...toJsonObject(result), success: result.success };
    },
  });
}
