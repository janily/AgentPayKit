import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const enabled = process.env.AGENTPAY_E2E_SEPOLIA === "1";
const REQUIRED_ENV = [
  "CDP_API_KEY_ID",
  "CDP_API_KEY_SECRET",
  "SEPOLIA_PAYEE_ADDRESS",
  "SEPOLIA_SIGNER_MODULE",
  "SEPOLIA_SPIKE_URL",
  "SEPOLIA_RPC_URL",
  "SEPOLIA_USDC_ADDRESS",
] as const;
const AMOUNT_ATOMIC = 10_000n;

interface SignerModule {
  createPaymentSignature(input: {
    paymentRequired: string;
    method: "POST";
    url: string;
    body: string;
  }): Promise<string>;
}

function requiredEnvironment(): Record<(typeof REQUIRED_ENV)[number], string> {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Base Sepolia gate is enabled but required variables are missing: ${missing.join(", ")}. No transaction was broadcast.`,
    );
  }
  return Object.fromEntries(
    REQUIRED_ENV.map((name) => [name, process.env[name]!]),
  ) as Record<(typeof REQUIRED_ENV)[number], string>;
}

async function rpc<T>(
  url: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = (await response.json()) as {
    result?: T;
    error?: { message?: string };
  };
  if (!response.ok || payload.error || payload.result === undefined) {
    throw new Error(
      `Sepolia RPC ${method} failed: ${payload.error?.message ?? response.status}`,
    );
  }
  return payload.result;
}

async function usdcBalance(
  rpcUrl: string,
  asset: string,
  account: string,
): Promise<bigint> {
  const accountWord = account
    .toLowerCase()
    .replace(/^0x/, "")
    .padStart(64, "0");
  const result = await rpc<string>(rpcUrl, "eth_call", [
    { to: asset, data: `0x70a08231${accountWord}` },
    "latest",
  ]);
  return BigInt(result);
}

function decodePaymentResponse(value: string): {
  transaction?: string;
  network?: string;
  success?: boolean;
} {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
    transaction?: string;
    network?: string;
    success?: boolean;
  };
}

async function waitForReceipt(
  rpcUrl: string,
  transaction: string,
): Promise<unknown> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const receipt = await rpc<unknown | null>(
      rpcUrl,
      "eth_getTransactionReceipt",
      [transaction],
    );
    if (receipt) return receipt;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
  }
  throw new Error(`Timed out waiting for Base Sepolia receipt ${transaction}`);
}

describe.skipIf(!enabled)("opt-in official x402 Base Sepolia gate", () => {
  test("settles exactly 0.01 USDC through an external isolated signer", async () => {
    const environment = requiredEnvironment();
    const spikeUrl = new URL(environment.SEPOLIA_SPIKE_URL).toString();
    const body = "{}";
    const balanceBefore = await usdcBalance(
      environment.SEPOLIA_RPC_URL,
      environment.SEPOLIA_USDC_ADDRESS,
      environment.SEPOLIA_PAYEE_ADDRESS,
    );

    const challengeResponse = await fetch(spikeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(challengeResponse.status).toBe(402);
    const paymentRequired = challengeResponse.headers.get("PAYMENT-REQUIRED");
    expect(paymentRequired).toBeTruthy();

    const signerUrl = pathToFileURL(
      resolve(environment.SEPOLIA_SIGNER_MODULE),
    ).href;
    const signer = (await import(signerUrl)) as Partial<SignerModule>;
    if (typeof signer.createPaymentSignature !== "function") {
      throw new Error(
        "SEPOLIA_SIGNER_MODULE must export createPaymentSignature(input)",
      );
    }
    const paymentSignature = await signer.createPaymentSignature({
      paymentRequired: paymentRequired!,
      method: "POST",
      url: spikeUrl,
      body,
    });

    const paidResponse = await fetch(spikeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "PAYMENT-SIGNATURE": paymentSignature,
      },
      body,
    });
    expect(paidResponse.status).toBe(200);
    await expect(paidResponse.json()).resolves.toMatchObject({
      pong: true,
      spike: "M2-only",
    });
    const paymentResponse = paidResponse.headers.get("PAYMENT-RESPONSE");
    expect(paymentResponse).toBeTruthy();
    const settlement = decodePaymentResponse(paymentResponse!);
    expect(settlement).toMatchObject({
      success: true,
      network: "eip155:84532",
    });
    expect(settlement.transaction).toMatch(/^0x[0-9a-fA-F]{64}$/);

    await waitForReceipt(environment.SEPOLIA_RPC_URL, settlement.transaction!);
    const balanceAfter = await usdcBalance(
      environment.SEPOLIA_RPC_URL,
      environment.SEPOLIA_USDC_ADDRESS,
      environment.SEPOLIA_PAYEE_ADDRESS,
    );
    expect(balanceAfter - balanceBefore).toBe(AMOUNT_ATOMIC);

    console.info(
      "M2_SEPOLIA_EVIDENCE",
      JSON.stringify({
        capturedAt: new Date().toISOString(),
        network: settlement.network,
        amountAtomic: AMOUNT_ATOMIC.toString(),
        transaction: settlement.transaction,
        paymentRequiredSha256: createHash("sha256")
          .update(paymentRequired!)
          .digest("hex"),
        paymentResponseSha256: createHash("sha256")
          .update(paymentResponse!)
          .digest("hex"),
      }),
    );
  }, 180_000);
});
