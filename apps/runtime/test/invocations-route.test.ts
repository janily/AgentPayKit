import { describe, expect, test, vi } from "vitest";

import { RuntimeRequestError } from "@agentpaykit/runtime-core";
import { createInvocationRoutes } from "../src/routes/invocations";

const request = {
  invocationId: "inv_01J00000000000000000000000",
  quoteId: "qte_01J00000000000000000000000",
  releaseId: `rel_${"a".repeat(64)}`,
  inputDigest: `sha256:${"b".repeat(64)}`,
  environment: "testnet",
  input: { query: "research" },
};
const signature = {
  algorithm: "Ed25519" as const,
  keyId: "runtime",
  value: "sig",
};

describe("asynchronous invocation HTTP routes", () => {
  test("returns a signed five-minute quote as an x402 challenge", async () => {
    const create = vi.fn(async () => ({
      quote: {
        quoteId: request.quoteId,
        expiresAt: "2026-07-19T00:05:00.000Z",
      },
      signature,
      paymentRequired: "official-payment-required",
    }));
    const app = createInvocationRoutes({
      quote: { create },
      invocation: { accept: vi.fn() },
      traceId: () => "trc_01J00000000000000000000000",
    });

    const response = await app.request(
      "http://runtime.test/v1/invocations/quote",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invocationId: request.invocationId,
          releaseId: request.releaseId,
          inputDigest: request.inputDigest,
          environment: request.environment,
        }),
      },
    );

    expect(response.status).toBe(402);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBe(
      "official-payment-required",
    );
    await expect(response.json()).resolves.toMatchObject({
      quote: { quoteId: request.quoteId },
      signature,
    });
  });

  test("returns 202 after verification and never exposes payment payload", async () => {
    const accept = vi.fn(async () => ({
      replayed: false,
      status: {
        payload: {
          schemaVersion: "1",
          invocationId: request.invocationId,
          status: "QUEUED",
          chargeState: "NOT_CHARGED",
          version: 1,
          updatedAt: "2026-07-19T00:01:00.000Z",
          traceId: "trc_01J00000000000000000000000",
        },
        signature,
      },
    }));
    const app = createInvocationRoutes({
      quote: { create: vi.fn() },
      invocation: { accept },
      traceId: () => "trc_01J00000000000000000000000",
    });

    const response = await app.request("http://runtime.test/v1/invocations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "PAYMENT-SIGNATURE": "official-payment-signature",
      },
      body: JSON.stringify(request),
    });

    expect(response.status).toBe(202);
    expect(accept).toHaveBeenCalledWith(
      expect.objectContaining({
        ...request,
        paymentHeader: "official-payment-signature",
        method: "POST",
      }),
    );
    expect(JSON.stringify(await response.json())).not.toMatch(
      /paymentPayload|authorization/,
    );
  });

  test("maps binding conflicts to a charge-aware 409 envelope", async () => {
    const app = createInvocationRoutes({
      quote: { create: vi.fn() },
      invocation: {
        accept: vi.fn(async () => {
          throw new RuntimeRequestError("INVOCATION_BINDING_CONFLICT", 409);
        }),
      },
      traceId: () => "trc_01J00000000000000000000000",
    });

    const response = await app.request("http://runtime.test/v1/invocations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "PAYMENT-SIGNATURE": "different-payment-signature",
      },
      body: JSON.stringify(request),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      schemaVersion: "1",
      error: {
        code: "INVOCATION_BINDING_CONFLICT",
        message: "Request could not be accepted.",
        chargeState: "NOT_CHARGED",
        traceId: "trc_01J00000000000000000000000",
      },
    });
  });

  test("removes the synchronous M2 spike", async () => {
    const app = createInvocationRoutes({
      quote: { create: vi.fn() },
      invocation: { accept: vi.fn() },
      traceId: () => "trc_01J00000000000000000000000",
    });
    const response = await app.request("http://runtime.test/spike/paid-ping", {
      method: "POST",
    });
    expect(response.status).toBe(404);
  });
});
