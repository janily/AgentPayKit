import { getDefaultAsset } from "@x402/evm";
import type { PaymentRequired } from "@x402/core/types";
import { getAddress } from "viem";

export const MAX_INPUT_BYTES = 32 * 1024;
export const MAX_RESULT_BYTES = 1024 * 1024;
export const MAX_UINT256 = (1n << 256n) - 1n;

export const NETWORKS = {
  "eip155:84532": {
    chainId: "0x14a34",
    rpcUrl: "https://sepolia.base.org",
    label: "Base Sepolia",
  },
  "eip155:8453": {
    chainId: "0x2105",
    rpcUrl: "https://mainnet.base.org",
    label: "Base",
  },
} as const;

export type SupportedNetwork = keyof typeof NETWORKS;

export const USDC_ASSETS = {
  "eip155:84532": getAddress(getDefaultAsset("eip155:84532").address),
  "eip155:8453": getAddress(getDefaultAsset("eip155:8453").address),
} as const satisfies Record<SupportedNetwork, `0x${string}`>;

export function isSupportedNetwork(
  network: string,
): network is SupportedNetwork {
  return Object.hasOwn(NETWORKS, network);
}

export interface SelectedRequirement {
  network: SupportedNetwork;
  asset: string;
  amount: bigint;
  payTo: string;
  resourceUrl: string;
  paymentRequired: PaymentRequired;
}

export interface PaymentReceipt {
  amount: string;
  currency: "USDC";
  network: string;
  payTo: string;
  transactionHash: string;
}

export interface CallResult {
  result: unknown;
  payment: PaymentReceipt | null;
}

export interface PaymentSummary {
  endpoint: string;
  amount: string;
  currency: "USDC";
  network: string;
  payTo: string;
}

export interface PreparedPaidCall {
  endpoint: string;
  body: string;
  requirement: SelectedRequirement;
  paymentSummary: PaymentSummary;
}

export type PreparePaidCallResult =
  | { kind: "free"; result: CallResult }
  | { kind: "payment-required"; preparedCall: PreparedPaidCall };

export interface FetchDependency {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}
