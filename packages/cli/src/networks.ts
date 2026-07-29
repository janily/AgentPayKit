import { getDefaultAsset } from "@x402/evm";
import { getAddress } from "viem";

export const NETWORKS = {
  "eip155:84532": {
    chainId: "0x14a34",
    rpcUrl: "https://sepolia.base.org",
    label: "Base Sepolia",
  },
} as const;

export type SupportedNetwork = keyof typeof NETWORKS;

export const USDC_ASSETS = {
  "eip155:84532": getAddress(getDefaultAsset("eip155:84532").address),
} as const satisfies Record<SupportedNetwork, `0x${string}`>;

export function isSupportedNetwork(
  network: string,
): network is SupportedNetwork {
  return Object.hasOwn(NETWORKS, network);
}
