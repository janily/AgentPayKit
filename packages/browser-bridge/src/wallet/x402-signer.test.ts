import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
} from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { describe, expect, test, vi } from "vitest";

import { OfficialX402WalletSigner, WalletApprovalError } from "./x402-signer";

const address = `0x${"1".repeat(40)}` as const;
const asset = `0x${"2".repeat(40)}` as const;
const payee = `0x${"3".repeat(40)}` as const;
const walletSignature = `0x${"4".repeat(130)}` as const;

function challenge(amount = "10000"): string {
  const required: PaymentRequired = {
    x402Version: 2,
    resource: {
      url: "https://runtime.test/v1/invocations",
      description: "AgentPayKit invocation",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:84532",
        asset,
        amount,
        payTo: payee,
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      },
    ],
  };
  return encodePaymentRequiredHeader(required);
}

function provider(
  input: {
    chainId?: string;
    balance?: bigint;
    rejectSignature?: boolean;
  } = {},
) {
  return {
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_chainId") return input.chainId ?? "0x14a34";
      if (method === "eth_requestAccounts") return [address];
      if (method === "eth_call") {
        return `0x${(input.balance ?? 50_000n).toString(16).padStart(64, "0")}`;
      }
      if (method === "eth_signTypedData_v4") {
        if (input.rejectSignature) throw new Error("User rejected the request");
        return walletSignature;
      }
      throw new Error(`unexpected provider method ${method}`);
    }),
  };
}

describe("OfficialX402WalletSigner", () => {
  test("uses the official Exact EVM client with an EIP-1193 wallet", async () => {
    const ethereum = provider();
    const signer = new OfficialX402WalletSigner(ethereum);

    const header = await signer.createPaymentSignature({
      paymentRequired: challenge(),
      expectedNetwork: "eip155:84532",
    });
    const payload = decodePaymentSignatureHeader(header);

    expect(payload.accepted).toMatchObject({
      scheme: "exact",
      network: "eip155:84532",
      asset,
      amount: "10000",
      payTo: payee,
    });
    expect(payload.payload).toMatchObject({ signature: walletSignature });
    expect(
      ethereum.request.mock.calls.some(
        ([request]) => request.method === "eth_signTypedData_v4",
      ),
    ).toBe(true);
  });

  test("rejects the wrong chain before requesting a signature", async () => {
    const ethereum = provider({ chainId: "0x2105" });

    await expect(
      new OfficialX402WalletSigner(ethereum).createPaymentSignature({
        paymentRequired: challenge(),
        expectedNetwork: "eip155:84532",
      }),
    ).rejects.toMatchObject({ code: "WRONG_WALLET_NETWORK" });
    expect(
      ethereum.request.mock.calls.some(
        ([request]) => request.method === "eth_signTypedData_v4",
      ),
    ).toBe(false);
  });

  test("rejects insufficient token balance before requesting a signature", async () => {
    const ethereum = provider({ balance: 9_999n });

    await expect(
      new OfficialX402WalletSigner(ethereum).createPaymentSignature({
        paymentRequired: challenge(),
        expectedNetwork: "eip155:84532",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_USDC_BALANCE" });
  });

  test("maps MetaMask rejection without exposing signing data", async () => {
    const ethereum = provider({ rejectSignature: true });

    const failure = await new OfficialX402WalletSigner(ethereum)
      .createPaymentSignature({
        paymentRequired: challenge(),
        expectedNetwork: "eip155:84532",
      })
      .catch((error) => error);
    expect(failure).toBeInstanceOf(WalletApprovalError);
    expect(failure).toMatchObject({ code: "WALLET_REJECTED" });
    expect(failure.message).not.toContain(walletSignature);
  });
});
