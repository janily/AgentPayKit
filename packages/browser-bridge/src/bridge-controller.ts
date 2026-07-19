import type { BridgeRequest } from "./App";
import {
  OfficialX402WalletSigner,
  type Eip1193Provider,
} from "./wallet/x402-signer";

export interface BridgeBootstrap {
  id: string;
  token: string;
  request: BridgeRequest & { paymentRequired: string };
}

async function action(
  bootstrap: BridgeBootstrap,
  name: "approve" | "reject" | "close",
  extra: Record<string, unknown> = {},
): Promise<void> {
  const response = await fetch(`/api/sessions/${bootstrap.id}/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: bootstrap.token, ...extra }),
    keepalive: name === "close",
  });
  if (!response.ok) throw new Error(`BRIDGE_${name.toUpperCase()}_FAILED`);
}

export function createBridgeController(
  bootstrap: BridgeBootstrap,
  ethereum: Eip1193Provider,
): {
  approve(): Promise<void>;
  reject(): Promise<void>;
  close(): void;
} {
  return {
    async approve() {
      const expectedNetwork = bootstrap.request.network;
      if (
        expectedNetwork !== "eip155:84532" &&
        expectedNetwork !== "eip155:8453"
      ) {
        throw new Error("UNSUPPORTED_PAYMENT_NETWORK");
      }
      const paymentSignature = await new OfficialX402WalletSigner(
        ethereum,
      ).createPaymentSignature({
        paymentRequired: bootstrap.request.paymentRequired,
        expectedNetwork,
      });
      await action(bootstrap, "approve", { paymentSignature });
    },
    reject: () => action(bootstrap, "reject"),
    close() {
      const body = JSON.stringify({ token: bootstrap.token });
      if (
        typeof navigator !== "undefined" &&
        navigator.sendBeacon(
          `/api/sessions/${bootstrap.id}/close`,
          new Blob([body], { type: "application/json" }),
        )
      ) {
        return;
      }
      void action(bootstrap, "close").catch(() => undefined);
    },
  };
}
