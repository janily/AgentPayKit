import {
  decodePaymentSignatureHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";

import type { CallDependencies } from "../../../packages/cli/src/call";
import type { SelectedRequirement } from "../../../packages/cli/src/challenge";

import { FIXTURE_PAYER, type Counters } from "./facilitator";

export function createFixtureWallet(
  counters: Counters,
  rejects: boolean,
  capture: (signature: string, decodedPayload: string) => void,
): Pick<CallDependencies, "connectWallet" | "createSignature"> {
  const provider = { request: async () => undefined };

  return {
    async connectWallet() {
      return {
        provider,
        selectedAccount: FIXTURE_PAYER,
        chainId: "0x14a34",
        async disconnect() {},
      };
    },
    async createSignature({ requirement }) {
      counters.signatureRequests += 1;
      if (rejects) throw new Error("PAYMENT_REJECTED");
      const signature = encodeFixtureSignature(requirement);
      capture(
        signature,
        JSON.stringify(decodePaymentSignatureHeader(signature)),
      );
      return signature;
    },
  };
}

function encodeFixtureSignature(requirement: SelectedRequirement): string {
  return encodePaymentSignatureHeader({
    x402Version: 2,
    resource: requirement.paymentRequired.resource,
    accepted: requirement.paymentRequired.accepts.find(
      (candidate) =>
        candidate.scheme === "exact" &&
        candidate.network === requirement.network &&
        candidate.asset.toLowerCase() === requirement.asset.toLowerCase() &&
        candidate.amount === requirement.amount.toString() &&
        candidate.payTo.toLowerCase() === requirement.payTo.toLowerCase(),
    )!,
    payload: {
      signature: "0x01",
      authorization: {},
      fixture: "agentpaykit-local",
    },
  });
}
