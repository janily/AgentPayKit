import { describe, expect, test } from "vitest";

import {
  canonicalJson,
  createErrorEnvelope,
  digestJson,
  invocationStatuses,
  parseErrorEnvelope,
  parseInvocationStatus,
  parseSignedReceipt,
  parseStatusEnvelope,
  signCanonical,
  signaturePayload,
  verifyCanonicalSignature,
} from "../src/index";

const privateKeySeed =
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const publicKey =
  "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";

function hex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
}

describe("canonical protocol bytes", () => {
  test("sorts object keys recursively and preserves array order", () => {
    expect(canonicalJson({ z: null, a: [3, { é: "line\n", a: true }] })).toBe(
      '{"a":[3,{"a":true,"é":"line\\n"}],"z":null}',
    );
  });

  test("has a stable SHA-256 golden digest", async () => {
    await expect(digestJson({ b: "two", a: 1 })).resolves.toBe(
      "sha256:f15bfc93d70801047473922f67fed863ecc7f82f0677ebb7122923aee81e0f97",
    );
  });

  test("domain-separates deterministic Runtime and Release signatures", async () => {
    const runtimeSignature = await signCanonical(
      "runtime-status-v1",
      { b: "two", a: 1 },
      {
        keyId: "runtime-test-key",
        privateKeySeed: hex(privateKeySeed),
      },
    );
    const releaseSignature = await signCanonical(
      "release-v1",
      { b: "two", a: 1 },
      {
        keyId: "publisher-test-key",
        privateKeySeed: hex(privateKeySeed),
      },
    );

    expect(
      new TextDecoder().decode(
        signaturePayload("runtime-status-v1", { b: "two", a: 1 }),
      ),
    ).toBe('agentpaykit:runtime-status-v1\n{"a":1,"b":"two"}');
    expect(runtimeSignature.value).toBe(
      "ErhqhgkFO7YARTK-G4Cc2qNmiKQkPL-4IlFlKQ2LNocZEy07QleUYM0dVVB2hyIZF2kvYbmc1IsXLqJ6VWJhCg",
    );
    expect(releaseSignature.value).toBe(
      "za-JZBN_YHu5hIlNYHrnoLdry4JWIfcc3T24q9sgn3SzeIhY8KjE8jvTllJBjsqbAStPmNu1ElHmJr5OctHLAQ",
    );
    await expect(
      verifyCanonicalSignature(
        "runtime-status-v1",
        { b: "two", a: 1 },
        runtimeSignature,
        hex(publicKey),
      ),
    ).resolves.toBe(true);
    await expect(
      verifyCanonicalSignature(
        "release-v1",
        { b: "tampered", a: 1 },
        releaseSignature,
        hex(publicKey),
      ),
    ).resolves.toBe(false);
  });
});

describe("strict invocation contracts", () => {
  test("freezes the eleven statuses and rejects unknown states", () => {
    expect(invocationStatuses).toHaveLength(11);
    expect(() => parseInvocationStatus("PAID")).toThrow(
      /unknown invocation status/,
    );
  });

  test("rejects unknown envelope fields", () => {
    expect(() =>
      parseStatusEnvelope({
        schemaVersion: "1",
        invocationId: "inv_01J00000000000000000000000",
        status: "QUEUED",
        chargeState: "NOT_CHARGED",
        version: 2,
        updatedAt: "2026-07-19T00:00:00.000Z",
        traceId: "trc_01J00000000000000000000000",
        rawInput: "must-not-pass",
      }),
    ).toThrow(/unknown field: rawInput/);
  });

  test("strictly parses signed receipts and rejects nested unknown fields", () => {
    const receipt = {
      payload: {
        schemaVersion: "1",
        invocationId: "inv_01J00000000000000000000000",
        releaseId: `rel_${"a".repeat(64)}`,
        inputDigest: `sha256:${"b".repeat(64)}`,
        payer: `0x${"c".repeat(40)}`,
        payee: `0x${"d".repeat(40)}`,
        network: "eip155:84532",
        asset: `0x${"e".repeat(40)}`,
        amount: "10000",
        transactionHash: `0x${"f".repeat(64)}`,
        executionStartedAt: "2026-07-19T00:00:01.000Z",
        executedAt: "2026-07-19T00:00:02.000Z",
        settledAt: "2026-07-19T00:00:03.000Z",
        resultDigest: `sha256:${"1".repeat(64)}`,
      },
      signature: {
        algorithm: "Ed25519",
        keyId: "runtime-test-key",
        value:
          "ErhqhgkFO7YARTK-G4Cc2qNmiKQkPL-4IlFlKQ2LNocZEy07QleUYM0dVVB2hyIZF2kvYbmc1IsXLqJ6VWJhCg",
      },
    } as const;

    expect(parseSignedReceipt(receipt)).toEqual(receipt);
    expect(() =>
      parseSignedReceipt({
        ...receipt,
        payload: { ...receipt.payload, rawInput: "must-not-pass" },
      }),
    ).toThrow(/unknown field: rawInput/);
  });

  test("creates and parses a charge-aware error golden envelope", () => {
    const envelope = createErrorEnvelope({
      code: "INVOCATION_BINDING_CONFLICT",
      message: "Invocation is already bound to a different request.",
      chargeState: "NOT_CHARGED",
      traceId: "trc_01J00000000000000000000000",
    });
    expect(canonicalJson(envelope)).toBe(
      '{"error":{"chargeState":"NOT_CHARGED","code":"INVOCATION_BINDING_CONFLICT","message":"Invocation is already bound to a different request.","traceId":"trc_01J00000000000000000000000"},"schemaVersion":"1"}',
    );
    expect(parseErrorEnvelope(envelope)).toEqual(envelope);
  });
});
