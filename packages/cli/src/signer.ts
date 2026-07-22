import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { ExactEvmScheme, type ClientEvmSigner } from "@x402/evm";
import {
  createPublicClient,
  custom,
  erc20Abi,
  getAddress,
  isAddress,
  isAddressEqual,
  isHex,
} from "viem";

import type { SelectedRequirement } from "./challenge";
import type { Eip1193Provider } from "./metamask";
import { NETWORKS, USDC_ASSETS } from "./networks";

export type { Eip1193Provider } from "./metamask";

export interface CreatePaymentSignatureOptions {
  provider: Eip1193Provider;
  selectedAccount: `0x${string}`;
  chainId: `0x${string}`;
  requirement: SelectedRequirement;
}

export async function createPaymentSignature({
  provider,
  selectedAccount,
  chainId,
  requirement,
}: CreatePaymentSignatureOptions): Promise<string> {
  try {
    const paymentRequired = bindSelectedPaymentRequired(requirement);
    await assertWalletState(provider, selectedAccount, chainId, requirement);

    const publicClient = createPublicClient({ transport: custom(provider) });
    const balance = await publicClient.readContract({
      address: getAddress(requirement.asset),
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [getAddress(selectedAccount)],
    });

    if (balance < requirement.amount) {
      throw new Error("INSUFFICIENT_USDC_BALANCE");
    }

    const signer: ClientEvmSigner = {
      address: getAddress(selectedAccount),
      signTypedData: async (typedData) => {
        await assertWalletState(
          provider,
          selectedAccount,
          chainId,
          requirement,
        );
        const signature = await provider.request({
          method: "eth_signTypedData_v4",
          params: [
            selectedAccount,
            JSON.stringify(typedData, (_key, value: unknown) =>
              typeof value === "bigint" ? value.toString() : value,
            ),
          ],
        });

        if (typeof signature !== "string" || !isHex(signature)) {
          throw new Error("PAYMENT_SIGNATURE_FAILED");
        }
        return signature;
      },
      readContract: (args) =>
        publicClient.readContract(
          args as Parameters<typeof publicClient.readContract>[0],
        ),
    };

    const client = new x402Client().register(
      requirement.network,
      new ExactEvmScheme(signer),
    );
    const httpClient = new x402HTTPClient(client);
    const payload = await httpClient.createPaymentPayload(paymentRequired);
    const header =
      httpClient.encodePaymentSignatureHeader(payload)["PAYMENT-SIGNATURE"];

    if (header === undefined) throw new Error("PAYMENT_SIGNATURE_FAILED");
    return header;
  } catch (error) {
    if (isErrorCode(error, 4001)) throw new Error("PAYMENT_REJECTED");
    if (isSafePaymentError(error)) throw error;
    throw new Error("PAYMENT_SIGNATURE_FAILED");
  }
}

async function assertWalletState(
  provider: Eip1193Provider,
  selectedAccount: `0x${string}`,
  chainId: `0x${string}`,
  requirement: SelectedRequirement,
): Promise<void> {
  const [accounts, currentChain] = await Promise.all([
    provider.request({ method: "eth_accounts", params: [] }),
    provider.request({ method: "eth_chainId", params: [] }),
  ]);
  const permittedAccounts = Array.isArray(accounts) ? accounts : [];
  const providerSelection = provider.selectedAccount;
  const currentAccount =
    providerSelection !== undefined ? providerSelection : permittedAccounts[0];
  const expectedChain = NETWORKS[requirement.network].chainId;

  if (
    typeof currentAccount !== "string" ||
    !isAddress(currentAccount) ||
    !isAddressEqual(currentAccount, selectedAccount) ||
    !permittedAccounts.some(
      (account) =>
        typeof account === "string" &&
        isAddress(account) &&
        isAddressEqual(account, currentAccount),
    ) ||
    typeof currentChain !== "string" ||
    currentChain.toLowerCase() !== chainId.toLowerCase() ||
    currentChain.toLowerCase() !== expectedChain.toLowerCase()
  ) {
    throw new Error("WALLET_STATE_CHANGED");
  }
}

function bindSelectedPaymentRequired(
  requirement: SelectedRequirement,
): PaymentRequired {
  if (
    !isAddress(requirement.asset) ||
    !isAddressEqual(requirement.asset, USDC_ASSETS[requirement.network]) ||
    !isAddress(requirement.payTo) ||
    requirement.amount <= 0n
  ) {
    throw new Error("PAYMENT_SIGNATURE_FAILED");
  }

  const matches = requirement.paymentRequired.accepts.filter((candidate) =>
    matchesSelectedRequirement(candidate, requirement),
  );
  if (matches.length !== 1) throw new Error("PAYMENT_SIGNATURE_FAILED");

  return {
    ...requirement.paymentRequired,
    accepts: [matches[0]!],
  };
}

function matchesSelectedRequirement(
  candidate: PaymentRequirements,
  selected: SelectedRequirement,
): boolean {
  if (
    candidate.scheme !== "exact" ||
    candidate.network !== selected.network ||
    typeof candidate.asset !== "string" ||
    !isAddress(candidate.asset) ||
    !isAddress(selected.asset) ||
    !isAddressEqual(candidate.asset, selected.asset) ||
    typeof candidate.payTo !== "string" ||
    !isAddress(candidate.payTo) ||
    !isAddress(selected.payTo) ||
    !isAddressEqual(candidate.payTo, selected.payTo) ||
    typeof candidate.amount !== "string" ||
    !/^[1-9][0-9]{0,77}$/.test(candidate.amount)
  ) {
    return false;
  }

  return BigInt(candidate.amount) === selected.amount;
}

function isErrorCode(error: unknown, code: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function isSafePaymentError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    [
      "INSUFFICIENT_USDC_BALANCE",
      "PAYMENT_REJECTED",
      "PAYMENT_SIGNATURE_FAILED",
      "WALLET_STATE_CHANGED",
    ].includes(error.message)
  );
}
