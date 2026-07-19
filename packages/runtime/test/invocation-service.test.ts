import { inputDigest } from "@agentpaykit/protocol";
import { describe, expect, test, vi } from "vitest";

import {
  InvocationService,
  RuntimeRequestError,
} from "../src/invocation-service";

const invocationId = "inv_01J00000000000000000000000";
const quoteId = "qte_01J00000000000000000000000";
const releaseId = `rel_${"a".repeat(64)}`;
const traceId = "trc_01J00000000000000000000000";
const input = { query: "bounded research" };

async function fixture(overrides: Record<string, unknown> = {}) {
  const digest = await inputDigest(input);
  const order: string[] = [];
  const verify = vi.fn(async () => {
    order.push("verify");
    return {
      paymentPayload: {
        x402Version: 2,
        payload: { authorization: "encrypted-later" },
      },
      paymentRequirements: { scheme: "exact", network: "eip155:84532" },
      declaredExtensions: {
        "payment-identifier": { info: { required: true, id: invocationId } },
      },
    };
  });
  const settle = vi.fn();
  const enqueue = vi.fn(async () => order.push("enqueue"));
  const repository = {
    getInvocation: vi.fn(async () => undefined),
    createOrGetInvocation: vi.fn(async (record: Record<string, unknown>) => {
      order.push("persist");
      return {
        kind: "created" as const,
        invocation: {
          ...record,
          status: "PAYMENT_VERIFIED" as const,
          chargeState: "NOT_CHARGED" as const,
          version: 0,
          createdAt: record.now,
          updatedAt: record.now,
        },
      };
    }),
    transition: vi.fn(async () => {
      order.push("transition");
      return true;
    }),
  };
  const service = new InvocationService({
    releases: {
      get: vi.fn(async () => {
        order.push("release");
        return {
          id: releaseId,
          environment: "testnet",
          network: "eip155:84532",
          amount: "10000",
          asset: `0x${"a".repeat(40)}`,
          payee: `0x${"b".repeat(40)}`,
        };
      }),
    },
    quotes: {
      get: vi.fn(async () => {
        order.push("quote");
        return {
          id: quoteId,
          invocationId,
          releaseId,
          inputDigest: digest,
          environment: "testnet",
          expiresAt: "2026-07-19T00:05:00.000Z",
        };
      }),
    },
    paymentIdentifier: {
      read: vi.fn(() => {
        order.push("identifier");
        return invocationId;
      }),
    },
    payment: { verify, settle },
    vault: {
      putJson: vi.fn(async (key: string) => {
        order.push(key.includes("input") ? "vault-input" : "vault-payment");
        return { key, digest: `sha256:${"d".repeat(64)}` };
      }),
      delete: vi.fn(),
    },
    repository,
    queue: { send: enqueue },
    signer: {
      sign: vi.fn(async () => ({
        algorithm: "Ed25519",
        keyId: "runtime",
        value: "sig",
      })),
    },
    now: () => new Date("2026-07-19T00:01:00.000Z"),
    traceId: () => traceId,
    ...overrides,
  });
  return { service, digest, order, verify, settle, enqueue, repository };
}

describe("InvocationService acceptance", () => {
  test("validates, verifies, encrypts, persists, queues and returns without settling", async () => {
    const { service, digest, order, verify, settle, enqueue } = await fixture();

    const accepted = await service.accept({
      invocationId,
      quoteId,
      releaseId,
      inputDigest: digest,
      environment: "testnet",
      input,
      paymentHeader: "official-payment-signature",
      method: "POST",
      url: "https://runtime.test/v1/invocations",
    });

    expect(accepted.status.payload).toMatchObject({
      status: "QUEUED",
      chargeState: "NOT_CHARGED",
    });
    expect(order).toEqual([
      "release",
      "quote",
      "identifier",
      "verify",
      "vault-input",
      "vault-payment",
      "persist",
      "transition",
      "enqueue",
    ]);
    expect(verify).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledOnce();
    expect(settle).not.toHaveBeenCalled();
  });

  test("does not verify or enqueue when input digest validation fails", async () => {
    const { service, verify, enqueue } = await fixture();
    await expect(
      service.accept({
        invocationId,
        quoteId,
        releaseId,
        inputDigest: `sha256:${"f".repeat(64)}`,
        environment: "testnet",
        input,
        paymentHeader: "official-payment-signature",
        method: "POST",
        url: "https://runtime.test/v1/invocations",
      }),
    ).rejects.toMatchObject({ code: "INPUT_DIGEST_MISMATCH" });
    expect(verify).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  test("returns an existing binding without verifying or queueing again", async () => {
    const existing = {
      id: invocationId,
      quoteId,
      releaseId,
      inputDigest: await inputDigest(input),
      requestFingerprint: "placeholder",
      status: "QUEUED" as const,
      chargeState: "NOT_CHARGED" as const,
      version: 1,
      traceId,
      updatedAt: "2026-07-19T00:01:00.000Z",
    };
    let stored = existing;
    const built = await fixture({
      repository: {
        getInvocation: vi.fn(async () => stored),
        createOrGetInvocation: vi.fn(),
        transition: vi.fn(),
      },
    });
    stored = {
      ...existing,
      requestFingerprint: await built.service.fingerprintForTest({
        invocationId,
        quoteId,
        releaseId,
        inputDigest: built.digest,
        environment: "testnet",
        paymentHeader: "official-payment-signature",
      }),
    };

    const accepted = await built.service.accept({
      invocationId,
      quoteId,
      releaseId,
      inputDigest: built.digest,
      environment: "testnet",
      input,
      paymentHeader: "official-payment-signature",
      method: "POST",
      url: "https://runtime.test/v1/invocations",
    });

    expect(accepted.replayed).toBe(true);
    expect(built.verify).not.toHaveBeenCalled();
    expect(built.enqueue).not.toHaveBeenCalled();
  });

  test("rejects a conflicting binding with HTTP-level 409 semantics", async () => {
    const built = await fixture({
      repository: {
        getInvocation: vi.fn(async () => ({
          requestFingerprint: `sha256:${"0".repeat(64)}`,
        })),
        createOrGetInvocation: vi.fn(),
        transition: vi.fn(),
      },
    });

    await expect(
      built.service.accept({
        invocationId,
        quoteId,
        releaseId,
        inputDigest: built.digest,
        environment: "testnet",
        input,
        paymentHeader: "official-payment-signature",
        method: "POST",
        url: "https://runtime.test/v1/invocations",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<RuntimeRequestError>>({
        code: "INVOCATION_BINDING_CONFLICT",
        status: 409,
      }),
    );
    expect(built.verify).not.toHaveBeenCalled();
  });
});
