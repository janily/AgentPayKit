import {
  encodePaymentRequiredHeader,
  decodePaymentRequiredHeader,
} from "@x402/core/http";
import { getDefaultAsset } from "@x402/evm";
import { describe, expect, it } from "vitest";

import {
  buildPaidSkillDescriptor,
  canonicalDescriptorJson,
  descriptorFingerprint,
  verifyDescriptorMatchesChallenge,
  type PaidSkillDescriptor,
} from "../src/descriptor";
import { definePaidSkill, type PaidSkillConfig, type Schema } from "../src";

const inputSchema: Schema<{ repository: string }> = {
  safeParse(value) {
    return typeof value === "object" &&
      value !== null &&
      typeof (value as { repository?: unknown }).repository === "string"
      ? { success: true, data: value as { repository: string } }
      : { success: false, error: {} };
  },
};

const outputSchema: Schema<{ summary: string }> = {
  safeParse(value) {
    return typeof value === "object" &&
      value !== null &&
      typeof (value as { summary?: unknown }).summary === "string"
      ? { success: true, data: value as { summary: string } }
      : { success: false, error: {} };
  },
};

function skill(overrides: Partial<PaidSkillConfig<unknown, unknown>> = {}) {
  return definePaidSkill({
    name: "paid-repo-review",
    version: "1.2.3",
    description:
      "Reviews a public GitHub repository and returns actionable findings.",
    endpointPath: "/api/invoke",
    price: "0.01",
    network: "base-sepolia",
    payTo: "0x1111111111111111111111111111111111111111",
    timeoutMs: 45_000,
    facilitatorUrl: "https://x402.org/facilitator",
    exampleInput: { repository: "https://github.com/openai/openai-node" },
    input: inputSchema as Schema<unknown>,
    output: outputSchema as Schema<unknown>,
    async execute(input) {
      return input;
    },
    ...overrides,
  });
}

function paymentRequired(
  descriptor: PaidSkillDescriptor,
  overrides: Record<string, unknown> = {},
): string {
  return encodePaymentRequiredHeader({
    x402Version: 2,
    resource: {
      url: descriptor.endpoint,
      description: descriptor.description,
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: descriptor.network,
        asset: descriptor.asset,
        amount: descriptor.price.atomicAmount,
        payTo: descriptor.payTo,
        maxTimeoutSeconds: 60,
        extra: {},
      },
    ],
    extensions: {},
    ...overrides,
  } as never);
}

describe("PaidSkillDescriptor", () => {
  it("builds a canonical immutable descriptor with a stable SHA-256 fingerprint", () => {
    const descriptor = buildPaidSkillDescriptor(skill(), {
      origin: "https://paid-review.example",
    });

    expect(descriptor).toEqual({
      schemaVersion: "agentpaykit.paid-skill.v1",
      skillId: "paid-repo-review",
      version: "1.2.3",
      name: "paid-repo-review",
      description:
        "Reviews a public GitHub repository and returns actionable findings.",
      descriptorUrl:
        "https://paid-review.example/.well-known/agentpay-skill.json",
      endpoint: "https://paid-review.example/api/invoke",
      price: {
        amount: "0.01",
        atomicAmount: "10000",
        currency: "USDC",
      },
      network: "eip155:84532",
      asset: getDefaultAsset("eip155:84532").address,
      payTo: "0x1111111111111111111111111111111111111111",
      maxInputBytes: 32 * 1024,
      timeoutMs: 45_000,
      input: {
        summary: "JSON input accepted by the skill schema.",
        example: { repository: "https://github.com/openai/openai-node" },
      },
      fingerprint: descriptor.fingerprint,
    });
    expect(descriptor.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(descriptor.fingerprint).toBe(descriptorFingerprint(descriptor));
    expect(canonicalDescriptorJson(descriptor)).toBe(
      '{"asset":"' +
        descriptor.asset +
        '","description":"Reviews a public GitHub repository and returns actionable findings.","descriptorUrl":"https://paid-review.example/.well-known/agentpay-skill.json","endpoint":"https://paid-review.example/api/invoke","fingerprint":"' +
        descriptor.fingerprint +
        '","input":{"example":{"repository":"https://github.com/openai/openai-node"},"summary":"JSON input accepted by the skill schema."},"maxInputBytes":32768,"name":"paid-repo-review","network":"eip155:84532","payTo":"0x1111111111111111111111111111111111111111","price":{"amount":"0.01","atomicAmount":"10000","currency":"USDC"},"schemaVersion":"agentpaykit.paid-skill.v1","skillId":"paid-repo-review","timeoutMs":45000,"version":"1.2.3"}',
    );
  });

  it("defaults the descriptor version to a SemVer value", () => {
    const descriptor = buildPaidSkillDescriptor(skill({ version: undefined }), {
      origin: "https://paid-review.example",
    });

    expect(descriptor.version).toBe("0.1.0");
  });

  it.each([
    ["non-HTTPS origin", "http://paid-review.example"],
    ["origin with a path", "https://paid-review.example/path"],
    ["origin with credentials", "https://user:pass@paid-review.example"],
    ["origin with search", "https://paid-review.example?x=1"],
    ["origin with hash", "https://paid-review.example#frag"],
  ])("rejects %s", (_name, origin) => {
    expect(() => buildPaidSkillDescriptor(skill(), { origin })).toThrow(
      "INVALID_PAID_SKILL_DESCRIPTOR",
    );
  });

  it.each(["1", "1.2", "v1.2.3", "1.2.3-beta", "01.2.3"])(
    "rejects non-MVP SemVer version %s",
    (version) => {
      expect(() =>
        buildPaidSkillDescriptor(skill({ version }), {
          origin: "https://paid-review.example",
        }),
      ).toThrow("INVALID_PAID_SKILL_CONFIG");
    },
  );

  it("rejects a malformed payTo address before publication", () => {
    const defined = {
      ...skill(),
      payTo: "0x0000000000000000000000000000000000000000",
    };

    expect(() =>
      buildPaidSkillDescriptor(defined, {
        origin: "https://paid-review.example",
      }),
    ).toThrow("INVALID_PAID_SKILL_DESCRIPTOR");
  });

  it.each([
    [
      "price",
      (descriptor: PaidSkillDescriptor) => ({
        ...descriptor,
        price: { ...descriptor.price, atomicAmount: "10001" },
      }),
    ],
    [
      "network",
      (descriptor: PaidSkillDescriptor) => ({
        ...descriptor,
        network: "eip155:8453",
      }),
    ],
    [
      "payTo",
      (descriptor: PaidSkillDescriptor) => ({
        ...descriptor,
        payTo: "0x2222222222222222222222222222222222222222",
      }),
    ],
    [
      "asset",
      (descriptor: PaidSkillDescriptor) => ({
        ...descriptor,
        asset: "0x2222222222222222222222222222222222222222",
      }),
    ],
    [
      "endpoint",
      (descriptor: PaidSkillDescriptor) => ({
        ...descriptor,
        endpoint: "https://paid-review.example/api/other",
      }),
    ],
  ] as const)(
    "detects %s drift against a live 402 challenge",
    (_name, mutate) => {
      const descriptor = buildPaidSkillDescriptor(skill(), {
        origin: "https://paid-review.example",
      });
      const challenge = decodePaymentRequiredHeader(
        paymentRequired(descriptor),
      );

      expect(() =>
        verifyDescriptorMatchesChallenge(mutate(descriptor), challenge),
      ).toThrow("SKILL_DESCRIPTOR_MISMATCH");
    },
  );

  it("accepts a descriptor that exactly matches the live 402 challenge", () => {
    const descriptor = buildPaidSkillDescriptor(skill(), {
      origin: "https://paid-review.example",
    });
    const challenge = decodePaymentRequiredHeader(paymentRequired(descriptor));

    expect(() =>
      verifyDescriptorMatchesChallenge(descriptor, challenge),
    ).not.toThrow();
  });
});
