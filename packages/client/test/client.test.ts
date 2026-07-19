import { describe, expect, test, vi } from "vitest";

import {
  AgentPayClient,
  ClientContractError,
  InvocationPendingError,
  type InstalledSkill,
  type VerifiedInstalledSkill,
} from "../src/index";

const invocationId = "inv_01J00000000000000000000000";
const releaseId = `rel_${"a".repeat(64)}`;
const inputDigest = `sha256:${"b".repeat(64)}`;
const signature = {
  algorithm: "Ed25519" as const,
  keyId: "runtime-key",
  value: "signature",
};
const skill = {
  packageBytes: new Uint8Array([1, 2, 3]),
  release: {
    payload: {
      schemaVersion: "1",
      releaseId,
      packageDigest: `sha256:${"c".repeat(64)}`,
      environment: "testnet",
      runtimeUrl: "https://runtime.test",
      runtimeKeyId: "runtime-key",
      runtimePublicKey: "runtime-public-key",
    },
    signature,
  },
  publisher: {
    keyId: "publisher-key",
    publicKey: new Uint8Array(32),
  },
} as unknown as InstalledSkill;
const verified = {
  releaseId,
  packageDigest: `sha256:${"c".repeat(64)}`,
  environment: "testnet",
  runtime: {
    url: "https://runtime.test",
    keyId: "runtime-key",
    publicKey: new Uint8Array(32),
  },
} as VerifiedInstalledSkill;

function fixture() {
  const order: string[] = [];
  const bindings = new Map<string, VerifiedInstalledSkill>();
  const runtime = {
    quote: vi.fn(async () => {
      order.push("quote");
      return {
        payload: {
          schemaVersion: "1",
          quoteId: "qte_01J00000000000000000000000",
          invocationId,
          releaseId,
          inputDigest,
          environment: "testnet",
          network: "eip155:84532",
          amount: "10000",
          asset: `0x${"1".repeat(40)}`,
          payee: `0x${"2".repeat(40)}`,
          paymentIdentifier: invocationId,
          issuedAt: "2026-07-19T00:00:00.000Z",
          expiresAt: "2026-07-19T00:05:00.000Z",
        },
        signature,
        paymentRequired: "official-x402-challenge",
      };
    }),
    invoke: vi.fn(async () => {
      order.push("invoke");
      return {
        payload: {
          schemaVersion: "1",
          invocationId,
          status: "QUEUED",
          chargeState: "NOT_CHARGED",
          version: 1,
          updatedAt: "2026-07-19T00:00:01.000Z",
          traceId: "trc_01J00000000000000000000000",
        },
        signature,
      };
    }),
    status: vi.fn(async () => {
      order.push("status");
      return {
        payload: {
          schemaVersion: "1",
          invocationId,
          status: "RESULT_AVAILABLE",
          chargeState: "CHARGED",
          version: 6,
          updatedAt: "2026-07-19T00:03:00.000Z",
          traceId: "trc_01J00000000000000000000000",
        },
        signature,
      };
    }),
    result: vi.fn(async () => {
      order.push("result");
      return {
        payload: {
          schemaVersion: "1",
          invocationId,
          status: "RESULT_AVAILABLE",
          resultDigest: `sha256:${"9".repeat(64)}`,
          result: { answer: "paid result" },
        },
        signature,
      };
    }),
    receipt: vi.fn(async () => {
      order.push("receipt");
      return {
        payload: {
          schemaVersion: "1",
          invocationId,
          releaseId,
          inputDigest,
          payer: `0x${"3".repeat(40)}`,
          payee: `0x${"2".repeat(40)}`,
          network: "eip155:84532",
          asset: `0x${"1".repeat(40)}`,
          amount: "10000",
          transactionHash: `0x${"f".repeat(64)}`,
          executionStartedAt: "2026-07-19T00:00:02.000Z",
          executedAt: "2026-07-19T00:02:00.000Z",
          settledAt: "2026-07-19T00:03:00.000Z",
          resultDigest: `sha256:${"9".repeat(64)}`,
        },
        signature: {
          ...signature,
          value:
            "ErhqhgkFO7YARTK-G4Cc2qNmiKQkPL-4IlFlKQ2LNocZEy07QleUYM0dVVB2hyIZF2kvYbmc1IsXLqJ6VWJhCg",
        },
      };
    }),
  };
  const client = new AgentPayClient({
    releaseVerifier: {
      verify: vi.fn(async () => {
        order.push("verify-release");
        return verified;
      }),
    },
    digest: vi.fn(async () => {
      order.push("digest");
      return inputDigest;
    }),
    runtime,
    paymentAuthorizer: {
      authorize: vi.fn(async () => {
        order.push("authorize");
        return "official-payment-signature";
      }),
    },
    signatureVerifier: {
      verify: vi.fn(async (domain) => {
        order.push(`verify-${domain}`);
        return true;
      }),
    },
    bindings: {
      get: vi.fn(async (id) => bindings.get(id)),
      put: vi.fn(async (id, binding) => {
        order.push("save-handle");
        bindings.set(id, binding);
      }),
    },
    invocationId: () => invocationId,
    poll: { sleep: vi.fn(), maximumWaitMs: 1_000 },
  });
  return { client, order, runtime };
}

describe("AgentPayClient", () => {
  test("verifies identities, digests locally, quotes, authorizes and invokes in order", async () => {
    const built = fixture();

    await expect(
      built.client.invoke(skill, { query: "bounded research" }),
    ).resolves.toMatchObject({
      invocationId,
      status: { payload: { status: "QUEUED" } },
    });
    expect(built.order).toEqual([
      "verify-release",
      "digest",
      "save-handle",
      "quote",
      "verify-runtime-quote-v1",
      "authorize",
      "invoke",
      "verify-runtime-status-v1",
    ]);
  });

  test("stops before HTTP when installed-skill verification fails", async () => {
    const built = fixture();
    const failure = new AgentPayClient({
      ...built.client.portsForTest,
      releaseVerifier: {
        verify: vi.fn(async () => {
          throw new ClientContractError("INVALID_RELEASE");
        }),
      },
    });

    await expect(failure.invoke(skill, {})).rejects.toMatchObject({
      code: "INVALID_RELEASE",
    });
    expect(built.runtime.quote).not.toHaveBeenCalled();
    expect(built.runtime.invoke).not.toHaveBeenCalled();
  });

  test("stops before HTTP when local input digesting fails", async () => {
    const built = fixture();
    built.client.portsForTest.digest = vi.fn(async () => {
      throw new ClientContractError("INPUT_NOT_CANONICAL");
    });

    await expect(built.client.invoke(skill, {})).rejects.toMatchObject({
      code: "INPUT_NOT_CANONICAL",
    });
    expect(built.runtime.quote).not.toHaveBeenCalled();
    expect(built.runtime.invoke).not.toHaveBeenCalled();
  });

  test("does not open wallet or invoke when the signed quote is invalid", async () => {
    const built = fixture();
    built.client.portsForTest.signatureVerifier.verify = vi.fn(
      async () => false,
    );

    await expect(built.client.invoke(skill, {})).rejects.toMatchObject({
      code: "INVALID_RUNTIME_SIGNATURE",
    });
    expect(built.runtime.invoke).not.toHaveBeenCalled();
    expect(built.order).not.toContain("authorize");
  });

  test("does not open the wallet or send input when budget reservation fails", async () => {
    const built = fixture();
    built.client.portsForTest.budget = {
      reserve: vi.fn(async () => {
        throw new ClientContractError("BUDGET_EXCEEDED");
      }),
      authorize: vi.fn(),
      markUnknown: vi.fn(),
      release: vi.fn(),
      settle: vi.fn(),
    };

    await expect(
      built.client.invoke(skill, { secret: "never-sent" }),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(built.order).not.toContain("authorize");
    expect(built.runtime.invoke).not.toHaveBeenCalled();
  });

  test("releases a reservation when wallet authorization is rejected", async () => {
    const built = fixture();
    const budget = {
      reserve: vi.fn(),
      authorize: vi.fn(),
      markUnknown: vi.fn(),
      release: vi.fn(),
      settle: vi.fn(),
    };
    built.client.portsForTest.budget = budget;
    built.client.portsForTest.paymentAuthorizer.authorize = vi.fn(async () => {
      throw new ClientContractError("WALLET_REJECTED");
    });

    await expect(built.client.invoke(skill, {})).rejects.toMatchObject({
      code: "WALLET_REJECTED",
    });
    expect(budget.release).toHaveBeenCalledWith(invocationId);
    expect(budget.markUnknown).not.toHaveBeenCalled();
  });

  test("keeps authorized budget held when invocation submission is uncertain", async () => {
    const built = fixture();
    const budget = {
      reserve: vi.fn(),
      authorize: vi.fn(),
      markUnknown: vi.fn(),
      release: vi.fn(),
      settle: vi.fn(),
    };
    built.client.portsForTest.budget = budget;
    built.runtime.invoke.mockRejectedValueOnce(new Error("network timeout"));

    await expect(built.client.invoke(skill, {})).rejects.toThrow(
      "network timeout",
    );
    expect(budget.authorize).toHaveBeenCalledWith(invocationId);
    expect(budget.markUnknown).toHaveBeenCalledWith(invocationId);
    expect(budget.release).not.toHaveBeenCalled();
  });

  test("resume only queries signed status and result", async () => {
    const built = fixture();
    await built.client.invoke(skill, {});
    built.order.length = 0;
    built.runtime.quote.mockClear();
    built.runtime.invoke.mockClear();

    await expect(built.client.resume(invocationId)).resolves.toMatchObject({
      invocationId,
      result: { answer: "paid result" },
    });
    expect(built.order).toEqual([
      "status",
      "verify-runtime-status-v1",
      "result",
      "verify-runtime-result-v1",
    ]);
    expect(built.runtime.quote).not.toHaveBeenCalled();
    expect(built.runtime.invoke).not.toHaveBeenCalled();
  });

  test("settles local budget only after verifying the signed Receipt", async () => {
    const built = fixture();
    const budget = {
      reserve: vi.fn(),
      authorize: vi.fn(),
      markUnknown: vi.fn(),
      release: vi.fn(),
      settle: vi.fn(),
    };
    built.client.portsForTest.budget = budget;
    await built.client.invoke(skill, {});
    built.order.length = 0;

    await built.client.resume(invocationId);

    expect(built.order).toEqual([
      "status",
      "verify-runtime-status-v1",
      "result",
      "verify-runtime-result-v1",
      "receipt",
      "verify-runtime-receipt-v1",
    ]);
    expect(budget.settle).toHaveBeenCalledWith(
      invocationId,
      expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    );
  });

  test("returns a recoverable handle when polling reaches its time limit", async () => {
    const built = fixture();
    await built.client.invoke(skill, {});
    built.runtime.status.mockResolvedValue({
      payload: {
        schemaVersion: "1",
        invocationId,
        status: "SETTLEMENT_UNKNOWN",
        chargeState: "SETTLEMENT_UNKNOWN",
        version: 5,
        updatedAt: "2026-07-19T00:02:00.000Z",
        traceId: "trc_01J00000000000000000000000",
      },
      signature,
    });

    const failure = await built.client
      .resume(invocationId)
      .catch((error) => error);
    expect(failure).toBeInstanceOf(InvocationPendingError);
    expect(failure).toMatchObject({
      code: "INVOCATION_PENDING",
      handle: {
        invocationId,
        status: { payload: { status: "SETTLEMENT_UNKNOWN" } },
      },
    });
    expect(built.runtime.result).not.toHaveBeenCalled();
  });
});
