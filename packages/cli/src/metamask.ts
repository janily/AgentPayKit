import { createEVMClient, type ProviderRequest } from "@metamask/connect-evm";
import { isAddress, isAddressEqual } from "viem";

import { NETWORKS, type SupportedNetwork } from "./networks";

export interface Eip1193Provider {
  readonly selectedAccount?: `0x${string}`;
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

export interface MetaMaskClient {
  connect(options: { chainIds: [`0x${string}`] }): Promise<{
    accounts: `0x${string}`[];
    chainId: `0x${string}`;
  }>;
  getProvider(): Eip1193Provider;
  disconnect(): Promise<void>;
}

export interface MetaMaskClientOptions {
  dapp: { name: string; url: string };
  api: { supportedNetworks: Record<`0x${string}`, string> };
  analytics: { enabled: false };
  ui: { headless: true };
  skipAutoAnnounce: true;
  eventHandlers: { displayUri: (uri: string) => void };
}

export type MetaMaskClientFactory = (
  options: MetaMaskClientOptions,
) => Promise<MetaMaskClient>;

export interface WalletSession {
  provider: Eip1193Provider;
  selectedAccount: `0x${string}`;
  chainId: `0x${string}`;
  disconnect(): Promise<void>;
}

export interface ConnectMetaMaskOptions {
  network: SupportedNetwork;
  onUri(uri: string): void;
  timeoutMs: number;
  createClient?: MetaMaskClientFactory;
}

const defaultFactory: MetaMaskClientFactory = async (options) => {
  const client = await createEVMClient(options);
  const officialProvider = client.getProvider();
  const provider: Eip1193Provider = {
    get selectedAccount() {
      return officialProvider.selectedAccount;
    },
    request: (args) => officialProvider.request(args as ProviderRequest),
  };

  return {
    connect: (connectOptions) => client.connect(connectOptions),
    getProvider: () => provider,
    disconnect: () => client.disconnect(),
  };
};

export function metaMaskClientOptions(
  onUri: (uri: string) => void,
): MetaMaskClientOptions {
  return {
    dapp: {
      name: "AgentPayKit CLI",
      url: "https://github.com/janily/AgentPayKit",
    },
    api: {
      supportedNetworks: {
        "0x14a34": NETWORKS["eip155:84532"].rpcUrl,
        "0x2105": NETWORKS["eip155:8453"].rpcUrl,
      },
    },
    analytics: { enabled: false },
    ui: { headless: true },
    skipAutoAnnounce: true,
    eventHandlers: { displayUri: onUri },
  };
}

export async function initializeMetaMaskClient(): Promise<void> {
  const client = await defaultFactory(metaMaskClientOptions(() => undefined));
  client.getProvider();
}

export async function disconnectMetaMaskClient(): Promise<void> {
  const client = await defaultFactory(metaMaskClientOptions(() => undefined));
  await client.disconnect();
}

export async function connectMetaMask({
  network,
  onUri,
  timeoutMs,
  createClient = defaultFactory,
}: ConnectMetaMaskOptions): Promise<WalletSession> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("WALLET_CONFIRMATION_TIMEOUT");
  }

  let client: MetaMaskClient | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      expired = true;
      void client?.disconnect().catch(() => undefined);
      reject(new Error("WALLET_CONFIRMATION_TIMEOUT"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      (async () => {
        client = await createClient(metaMaskClientOptions(onUri));

        if (expired) {
          await client.disconnect();
          throw new Error("WALLET_CONFIRMATION_TIMEOUT");
        }

        const connected = await client.connect({
          chainIds: [NETWORKS[network].chainId],
        });
        if (expired) {
          await client.disconnect();
          throw new Error("WALLET_CONFIRMATION_TIMEOUT");
        }
        const provider = client.getProvider();
        const currentSelection = provider.selectedAccount;
        const selectedAccount =
          currentSelection !== undefined &&
          isAddress(currentSelection) &&
          connected.accounts.some((account) =>
            isAddressEqual(account, currentSelection),
          )
            ? currentSelection
            : connected.accounts[0];

        if (
          selectedAccount === undefined ||
          !isAddress(selectedAccount) ||
          connected.chainId.toLowerCase() !==
            NETWORKS[network].chainId.toLowerCase()
        ) {
          await client.disconnect();
          throw new Error("WALLET_STATE_CHANGED");
        }

        return {
          provider,
          selectedAccount,
          chainId: connected.chainId,
          disconnect: () => client!.disconnect(),
        };
      })(),
      timeout,
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      ["WALLET_CONFIRMATION_TIMEOUT", "WALLET_STATE_CHANGED"].includes(
        error.message,
      )
    ) {
      throw error;
    }
    await client?.disconnect().catch(() => undefined);
    throw new Error("WALLET_CONNECTION_FAILED");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
