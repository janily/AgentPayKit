export const BASE_SEPOLIA_NETWORK = "eip155:84532" as const;
export const BASE_MAINNET_NETWORK = "eip155:8453" as const;

export const SUPPORTED_NETWORKS = [
  BASE_SEPOLIA_NETWORK,
  BASE_MAINNET_NETWORK,
] as const;
export type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[number];

export function isSupportedNetwork(value: string): value is SupportedNetwork {
  return SUPPORTED_NETWORKS.some((network) => network === value);
}
