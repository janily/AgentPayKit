import {
  HTTPFacilitatorClient,
  encodePaymentRequiredHeader,
} from "@x402/core/http";
import { x402ResourceServer } from "@x402/core/server";
import type {
  PaymentRequired,
  PaymentRequirements,
  ResourceInfo,
} from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  PAYMENT_IDENTIFIER,
  declarePaymentIdentifierExtension,
  paymentIdentifierResourceServerExtension,
} from "@x402/extensions/payment-identifier";

interface ChallengeResourceServerPort {
  buildPaymentRequirementsFromOptions(
    options: Array<{
      scheme: "exact";
      network: "eip155:84532" | "eip155:8453";
      payTo: string;
      price: { amount: string; asset: string };
    }>,
    context: Record<string, never>,
  ): Promise<PaymentRequirements[]>;
  createPaymentRequiredResponse(
    requirements: PaymentRequirements[],
    resource: ResourceInfo,
    error?: string,
    extensions?: Record<string, unknown>,
  ): Promise<PaymentRequired>;
}

export interface PaymentChallengeTerms {
  network: "eip155:84532" | "eip155:8453";
  amount: string;
  asset: `0x${string}`;
  payee: `0x${string}`;
}

export class PaymentChallengeIssuer {
  constructor(
    private readonly resourceServer: ChallengeResourceServerPort,
    private readonly resourceUrl: string,
  ) {}

  async issue(terms: PaymentChallengeTerms): Promise<string> {
    const requirements =
      await this.resourceServer.buildPaymentRequirementsFromOptions(
        [
          {
            scheme: "exact",
            network: terms.network,
            payTo: terms.payee,
            price: { amount: terms.amount, asset: terms.asset },
          },
        ],
        {},
      );
    const paymentRequired =
      await this.resourceServer.createPaymentRequiredResponse(
        requirements,
        {
          url: this.resourceUrl,
          description: "AgentPayKit asynchronous paid invocation",
          mimeType: "application/json",
        },
        undefined,
        {
          [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true),
        },
      );
    return encodePaymentRequiredHeader(paymentRequired);
  }
}

export async function createOfficialPaymentChallengeIssuer(options: {
  facilitatorUrl: string;
  resourceUrl: string;
  createAuthHeaders?: () => Promise<{
    verify: Record<string, string>;
    settle: Record<string, string>;
    supported: Record<string, string>;
  }>;
}): Promise<PaymentChallengeIssuer> {
  const facilitator = new HTTPFacilitatorClient({
    url: options.facilitatorUrl,
    ...(options.createAuthHeaders
      ? { createAuthHeaders: options.createAuthHeaders }
      : {}),
  });
  const resourceServer = new x402ResourceServer(facilitator)
    .register("eip155:84532", new ExactEvmScheme())
    .register("eip155:8453", new ExactEvmScheme())
    .registerExtension(paymentIdentifierResourceServerExtension);
  await resourceServer.initialize();
  return new PaymentChallengeIssuer(resourceServer, options.resourceUrl);
}
