import { getDefaultAsset } from "@x402/evm";
import { getAddress } from "viem";

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
