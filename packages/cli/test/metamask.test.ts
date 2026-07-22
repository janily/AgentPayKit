import { createEVMClient } from "@metamask/connect-evm";
import { describe, expect, it, vi } from "vitest";

import {
  connectMetaMask,
  disconnectMetaMaskClient,
  initializeMetaMaskClient,
  type MetaMaskClientFactory,
} from "../src/metamask";

const OLD_ACCOUNT = "0x1111111111111111111111111111111111111111";
const CURRENT_ACCOUNT = "0x2222222222222222222222222222222222222222";

vi.mock("@metamask/connect-evm", () => ({ createEVMClient: vi.fn() }));

describe("connectMetaMask", () => {
  it("initializes and disconnects persisted state without connecting or requesting accounts", async () => {
    const connect = vi.fn();
    const request = vi.fn();
    const disconnect = vi.fn(async () => undefined);
    vi.mocked(createEVMClient)
      .mockResolvedValueOnce({
        connect,
        getProvider: () => ({ request }),
        disconnect,
      } as never)
      .mockResolvedValueOnce({
        connect,
        getProvider: () => ({ request }),
        disconnect,
      } as never);

    await initializeMetaMaskClient();
    await disconnectMetaMaskClient();

    expect(connect).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("uses the official privacy options, forwards only displayUri, and selects the current account", async () => {
    const onUri = vi.fn();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const disconnect = vi.fn(async () => {});
    const provider = {
      selectedAccount: CURRENT_ACCOUNT,
      request: vi.fn(async () => undefined),
    };
    let receivedOptions: Record<string, unknown> | undefined;
    const createClient: MetaMaskClientFactory = vi.fn(async (options) => {
      receivedOptions = options as unknown as Record<string, unknown>;
      options.eventHandlers?.displayUri?.("wc:private-connection-uri");
      return {
        connect: vi.fn(async () => ({
          accounts: [OLD_ACCOUNT, CURRENT_ACCOUNT],
          chainId: "0x14a34" as const,
        })),
        getProvider: () => provider,
        disconnect,
      };
    });

    const session = await connectMetaMask({
      network: "eip155:84532",
      onUri,
      timeoutMs: 100,
      createClient,
    });

    expect(receivedOptions).toMatchObject({
      dapp: {
        name: "AgentPayKit CLI",
        url: "https://github.com/janily/AgentPayKit",
      },
      api: {
        supportedNetworks: {
          "0x14a34": "https://sepolia.base.org",
          "0x2105": "https://mainnet.base.org",
        },
      },
      analytics: { enabled: false },
      ui: { headless: true },
      skipAutoAnnounce: true,
    });
    expect(onUri).toHaveBeenCalledWith("wc:private-connection-uri");
    expect(consoleLog).not.toHaveBeenCalled();
    expect(session).toMatchObject({
      provider,
      selectedAccount: CURRENT_ACCOUNT,
      chainId: "0x14a34",
    });

    await session.disconnect();
    expect(disconnect).toHaveBeenCalledTimes(1);
    consoleLog.mockRestore();
  });

  it("passes privacy options through the production official client factory", async () => {
    const onUri = vi.fn();
    const provider = {
      selectedAccount: CURRENT_ACCOUNT,
      request: vi.fn(async () => undefined),
    };
    vi.mocked(createEVMClient).mockImplementationOnce(async (options) => {
      options.eventHandlers?.displayUri?.("wc:official-client-uri");
      return {
        connect: vi.fn(async () => ({
          accounts: [CURRENT_ACCOUNT],
          chainId: "0x2105" as const,
        })),
        getProvider: () => provider,
        disconnect: vi.fn(async () => {}),
      } as never;
    });

    const session = await connectMetaMask({
      network: "eip155:8453",
      onUri,
      timeoutMs: 100,
    });

    expect(createEVMClient).toHaveBeenCalledWith(
      expect.objectContaining({
        dapp: {
          name: "AgentPayKit CLI",
          url: "https://github.com/janily/AgentPayKit",
        },
        api: {
          supportedNetworks: {
            "0x14a34": "https://sepolia.base.org",
            "0x2105": "https://mainnet.base.org",
          },
        },
        analytics: { enabled: false },
        ui: { headless: true },
        skipAutoAnnounce: true,
      }),
    );
    expect(onUri).toHaveBeenCalledWith("wc:official-client-uri");
    expect(session.selectedAccount).toBe(CURRENT_ACCOUNT);
  });

  it("maps wallet connection expiry to a stable timeout without exposing the URI", async () => {
    const createClient: MetaMaskClientFactory = vi.fn(async () => ({
      connect: vi.fn(() => new Promise(() => {})),
      getProvider: vi.fn(),
      disconnect: vi.fn(async () => {}),
    }));

    await expect(
      connectMetaMask({
        network: "eip155:8453",
        onUri: vi.fn(),
        timeoutMs: 5,
        createClient,
      }),
    ).rejects.toThrow("WALLET_CONFIRMATION_TIMEOUT");
  });

  it("disconnects a client that finishes initializing after the timeout", async () => {
    let resolveClient!: (client: {
      connect: ReturnType<typeof vi.fn>;
      getProvider: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }) => void;
    const disconnect = vi.fn(async () => {});
    const createClient: MetaMaskClientFactory = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveClient = resolve;
        }),
    );
    const pending = connectMetaMask({
      network: "eip155:84532",
      onUri: vi.fn(),
      timeoutMs: 5,
      createClient,
    });

    await expect(pending).rejects.toThrow("WALLET_CONFIRMATION_TIMEOUT");
    resolveClient({
      connect: vi.fn(),
      getProvider: vi.fn(),
      disconnect,
    });
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalledTimes(1));
  });

  it("sanitizes connection errors", async () => {
    const createClient: MetaMaskClientFactory = vi.fn(async () => ({
      connect: vi.fn(async () => {
        throw new Error("wc:private-connection-uri");
      }),
      getProvider: vi.fn(),
      disconnect: vi.fn(async () => {}),
    }));

    const pending = connectMetaMask({
      network: "eip155:84532",
      onUri: vi.fn(),
      timeoutMs: 100,
      createClient,
    });
    await expect(pending).rejects.toThrow("WALLET_CONNECTION_FAILED");
    await expect(pending).rejects.not.toThrow("private-connection-uri");
  });
});
