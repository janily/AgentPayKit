import { x402Client, x402HTTPClient } from "@x402/core/client";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { ExactEvmScheme, type ClientEvmSigner } from "@x402/evm";
import { createPublicClient, custom, erc20Abi, type Address } from "viem";

export interface Eip1193Provider {
  request(input: { method: string; params?: unknown[] }): Promise<unknown>;
}

export class WalletApprovalError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "WalletApprovalError";
  }
}

function evmAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

export class OfficialX402WalletSigner {
  constructor(private readonly provider: Eip1193Provider) {}

  async createPaymentSignature(input: {
    paymentRequired: string;
    expectedNetwork: "eip155:84532" | "eip155:8453";
  }): Promise<string> {
    let required;
    try {
      required = decodePaymentRequiredHeader(input.paymentRequired);
    } catch {
      throw new WalletApprovalError("INVALID_PAYMENT_REQUIRED");
    }
    const requirement = required.accepts.find(
      (candidate) =>
        candidate.scheme === "exact" &&
        candidate.network === input.expectedNetwork,
    );
    if (
      !requirement ||
      !evmAddress(requirement.asset) ||
      !evmAddress(requirement.payTo) ||
      !/^(0|[1-9][0-9]*)$/.test(requirement.amount)
    ) {
      throw new WalletApprovalError("UNSUPPORTED_PAYMENT_REQUIREMENT");
    }

    const expectedChainId = BigInt(input.expectedNetwork.split(":")[1]!);
    const chainId = await this.provider.request({ method: "eth_chainId" });
    if (typeof chainId !== "string" || BigInt(chainId) !== expectedChainId) {
      throw new WalletApprovalError("WRONG_WALLET_NETWORK");
    }
    const accounts = await this.provider.request({
      method: "eth_requestAccounts",
    });
    const address = Array.isArray(accounts) ? accounts[0] : undefined;
    if (!evmAddress(address)) {
      throw new WalletApprovalError("WALLET_ACCOUNT_UNAVAILABLE");
    }

    const publicClient = createPublicClient({
      transport: custom(this.provider as never),
    });
    const balance = await publicClient.readContract({
      address: requirement.asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    if (balance < BigInt(requirement.amount)) {
      throw new WalletApprovalError("INSUFFICIENT_USDC_BALANCE");
    }

    const signer: ClientEvmSigner = {
      address,
      signTypedData: async (message) => {
        try {
          const result = await this.provider.request({
            method: "eth_signTypedData_v4",
            params: [
              address,
              JSON.stringify(
                {
                  domain: message.domain,
                  types: message.types,
                  primaryType: message.primaryType,
                  message: message.message,
                },
                (_key, value: unknown) =>
                  typeof value === "bigint" ? value.toString() : value,
              ),
            ],
          });
          if (typeof result !== "string" || !/^0x[0-9a-fA-F]+$/.test(result)) {
            throw new Error("invalid wallet signature");
          }
          return result as `0x${string}`;
        } catch {
          throw new WalletApprovalError("WALLET_REJECTED");
        }
      },
      readContract: (request) => publicClient.readContract(request as never),
    };
    const client = new x402Client().register(
      input.expectedNetwork,
      new ExactEvmScheme(signer),
    );
    let payload;
    try {
      payload = await client.createPaymentPayload(required);
    } catch (error) {
      if (error instanceof WalletApprovalError) throw error;
      throw new WalletApprovalError("PAYMENT_PAYLOAD_CREATION_FAILED");
    }
    const headers = new x402HTTPClient(client).encodePaymentSignatureHeader(
      payload,
    );
    const paymentSignature = headers["PAYMENT-SIGNATURE"];
    if (!paymentSignature) {
      throw new WalletApprovalError("PAYMENT_PAYLOAD_CREATION_FAILED");
    }
    return paymentSignature;
  }
}
