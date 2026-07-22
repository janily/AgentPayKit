import { decodeFunctionData, encodeFunctionResult, erc20Abi } from "viem";
import { describe, expect, it, vi } from "vitest";

import type { SelectedRequirement } from "../src/challenge";
import { connectMetaMask, type MetaMaskClientFactory } from "../src/metamask";
import { USDC_ASSETS } from "../src/networks";
import { createPaymentSignature, type Eip1193Provider } from "../src/signer";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const PAYEE = "0x2222222222222222222222222222222222222222";
const OTHER_ACCOUNT = "0x3333333333333333333333333333333333333333";
const OTHER_ASSET = "0x4444444444444444444444444444444444444444";
const SIGNATURE = `0x${"11".repeat(65)}` as const;

function requirement(
  amount = 50_000n,
  siblings: Array<Record<string, unknown>> = [],
): SelectedRequirement {
  const paymentRequirement = {
    scheme: "exact",
    network: "eip155:84532",
    asset: USDC_ASSETS["eip155:84532"],
    amount: amount.toString(),
    payTo: PAYEE,
    maxTimeoutSeconds: 300,
    extra: { name: "USDC", version: "2" },
  };

  return {
    network: "eip155:84532",
    asset: USDC_ASSETS["eip155:84532"],
    amount,
    payTo: PAYEE,
    resourceUrl: "https://skill.example/api/invoke",
    paymentRequired: {
      x402Version: 2,
      resource: {
        url: "https://skill.example/api/invoke",
        description: "Runs a paid skill.",
        mimeType: "application/json",
      },
      accepts: [...siblings, paymentRequirement],
    },
  };
}

function provider(options: {
  account?: string;
  accounts?: string[] | (() => string[]);
  selectedAccount?: `0x${string}`;
  chainId?: string;
  balance?: bigint;
  signError?: unknown;
}) {
  const signRequests: unknown[] = [];
  const request = vi.fn(async ({ method, params }) => {
    if (method === "eth_accounts") {
      return typeof options.accounts === "function"
        ? options.accounts()
        : (options.accounts ?? [options.account ?? ACCOUNT]);
    }
    if (method === "eth_chainId") return options.chainId ?? "0x14a34";
    if (method === "eth_call") {
      const call = (params as [{ data: `0x${string}` }])[0];
      expect(
        decodeFunctionData({ abi: erc20Abi, data: call.data }),
      ).toMatchObject({
        functionName: "balanceOf",
        args: [ACCOUNT],
      });
      return encodeFunctionResult({
        abi: erc20Abi,
        functionName: "balanceOf",
        result: options.balance ?? 1_000_000n,
      });
    }
    if (method === "eth_signTypedData_v4") {
      signRequests.push(params);
      if (options.signError !== undefined) throw options.signError;
      return SIGNATURE;
    }
    throw new Error(`unexpected method ${method}`);
  });

  return {
    request,
    signRequests,
    selectedAccount: options.selectedAccount,
  } satisfies Eip1193Provider & {
    signRequests: unknown[];
  };
}

describe("createPaymentSignature", () => {
  it("uses the official x402 signer path and requests one fresh signature per call", async () => {
    const wallet = provider({});

    const first = await createPaymentSignature({
      provider: wallet,
      selectedAccount: ACCOUNT,
      chainId: "0x14a34",
      requirement: requirement(),
    });
    const second = await createPaymentSignature({
      provider: wallet,
      selectedAccount: ACCOUNT,
      chainId: "0x14a34",
      requirement: requirement(),
    });

    expect(first).toEqual(expect.any(String));
    expect(second).toEqual(expect.any(String));
    expect(wallet.signRequests).toHaveLength(2);
    for (const params of wallet.signRequests) {
      expect(params).toEqual([ACCOUNT, expect.any(String)]);
    }
    expect((wallet.signRequests[0] as unknown[])[1]).not.toBe(
      (wallet.signRequests[1] as unknown[])[1],
    );
  });

  it("binds the signature to the validated USDC quote when an attacker-controlled sibling comes first", async () => {
    const wallet = provider({});
    const selected = requirement(50_000n, [
      {
        scheme: "exact",
        network: "eip155:84532",
        asset: OTHER_ASSET,
        amount: "999999",
        payTo: OTHER_ACCOUNT,
        maxTimeoutSeconds: 300,
        extra: { name: "Attacker Token", version: "1" },
      },
    ]);

    await createPaymentSignature({
      provider: wallet,
      selectedAccount: ACCOUNT,
      chainId: "0x14a34",
      requirement: selected,
    });

    expect(wallet.signRequests).toHaveLength(1);
    const typedData = JSON.parse(
      (wallet.signRequests[0] as [string, string])[1],
    ) as {
      domain: { verifyingContract: string };
      message: { to: string; value: string };
    };
    expect(typedData.domain.verifyingContract.toLowerCase()).toBe(
      USDC_ASSETS["eip155:84532"].toLowerCase(),
    );
    expect(typedData.message).toMatchObject({
      to: PAYEE,
      value: "50000",
    });
  });

  it.each([
    ["ambiguous", requirement(50_000n)],
    ["missing", undefined],
  ])("does not sign when the selected quote is %s", async (kind, duplicate) => {
    const wallet = provider({});
    const selected = requirement();
    selected.paymentRequired.accepts =
      kind === "ambiguous"
        ? [
            selected.paymentRequired.accepts[0]!,
            duplicate!.paymentRequired.accepts[0]!,
          ]
        : [
            {
              ...selected.paymentRequired.accepts[0]!,
              amount: "50001",
            },
          ];

    await expect(
      createPaymentSignature({
        provider: wallet,
        selectedAccount: ACCOUNT,
        chainId: "0x14a34",
        requirement: selected,
      }),
    ).rejects.toThrow("PAYMENT_SIGNATURE_FAILED");
    expect(wallet.signRequests).toHaveLength(0);
  });

  it("uses the provider-selected current account when it is not the first permitted account", async () => {
    const wallet = provider({
      accounts: [OTHER_ACCOUNT, ACCOUNT],
      selectedAccount: ACCOUNT,
    });
    const createClient: MetaMaskClientFactory = vi.fn(async () => ({
      connect: vi.fn(async () => ({
        accounts: [OTHER_ACCOUNT, ACCOUNT],
        chainId: "0x14a34" as const,
      })),
      getProvider: () => wallet,
      disconnect: vi.fn(async () => {}),
    }));
    const session = await connectMetaMask({
      network: "eip155:84532",
      onUri: vi.fn(),
      timeoutMs: 100,
      createClient,
    });

    await expect(
      createPaymentSignature({
        provider: session.provider,
        selectedAccount: session.selectedAccount,
        chainId: session.chainId,
        requirement: requirement(),
      }),
    ).resolves.toEqual(expect.any(String));
    expect(wallet.signRequests).toHaveLength(1);
  });

  it.each([
    ["account", { account: PAYEE }],
    ["chain", { chainId: "0x2105" }],
  ])(
    "aborts when the current %s changed before signing",
    async (_name, state) => {
      const wallet = provider(state);

      await expect(
        createPaymentSignature({
          provider: wallet,
          selectedAccount: ACCOUNT,
          chainId: "0x14a34",
          requirement: requirement(),
        }),
      ).rejects.toThrow("WALLET_STATE_CHANGED");
      expect(wallet.signRequests).toHaveLength(0);
    },
  );

  it("maps EIP-1193 user rejection without exposing signature input", async () => {
    const wallet = provider({
      signError: {
        code: 4001,
        message: `rejected ${SIGNATURE}`,
        data: { typedData: "private" },
      },
    });

    const promise = createPaymentSignature({
      provider: wallet,
      selectedAccount: ACCOUNT,
      chainId: "0x14a34",
      requirement: requirement(),
    });

    await expect(promise).rejects.toThrow("PAYMENT_REJECTED");
    await expect(promise).rejects.not.toThrow(SIGNATURE);
  });

  it("rejects insufficient USDC before requesting a signature", async () => {
    const wallet = provider({ balance: 49_999n });

    await expect(
      createPaymentSignature({
        provider: wallet,
        selectedAccount: ACCOUNT,
        chainId: "0x14a34",
        requirement: requirement(),
      }),
    ).rejects.toThrow("INSUFFICIENT_USDC_BALANCE");
    expect(wallet.signRequests).toHaveLength(0);
  });

  it("aborts when the selected account changes after the balance read", async () => {
    let accountReads = 0;
    const wallet = provider({
      accounts: () => (++accountReads === 1 ? [ACCOUNT] : [OTHER_ACCOUNT]),
    });

    await expect(
      createPaymentSignature({
        provider: wallet,
        selectedAccount: ACCOUNT,
        chainId: "0x14a34",
        requirement: requirement(),
      }),
    ).rejects.toThrow("WALLET_STATE_CHANGED");
    expect(wallet.signRequests).toHaveLength(0);
  });
});
