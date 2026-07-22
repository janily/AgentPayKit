import { describe, expect, it } from "vitest";

import { atomicToUsdc, usdcToAtomic } from "../src/amount";
import {
  definePaidSkill,
  validatePaidSkillConfig,
  type PaidSkillConfig,
  type Schema,
} from "../src/config";

const stringSchema: Schema<string> = {
  safeParse(value) {
    return typeof value === "string"
      ? { success: true, data: value }
      : { success: false, error: {} };
  },
};

const unknownSchema: Schema<unknown> = {
  safeParse(value) {
    return { success: true, data: value };
  },
};

function paidSkillConfig(
  overrides: Partial<PaidSkillConfig<string, string>> = {},
): PaidSkillConfig<string, string> {
  return {
    name: "summarize-report",
    description: "Summarizes a report into concise findings.",
    endpointPath: "/api/invoke",
    price: "0.05",
    network: "base-sepolia",
    payTo: "0x1111111111111111111111111111111111111111",
    exampleInput: "Example report contents",
    input: stringSchema,
    output: stringSchema,
    async execute(input) {
      return input;
    },
    ...overrides,
  };
}

describe("USDC amounts", () => {
  it.each([
    ["0.000001", 1n],
    ["0.05", 50_000n],
    ["0.2", 200_000n],
    ["1", 1_000_000n],
  ])("converts %s USDC without Number", (price, atomic) => {
    expect(usdcToAtomic(price)).toBe(atomic);
    expect(atomicToUsdc(atomic)).toBe(price);
  });

  it.each(["0", "0.000000", "-1", ".1", "1.", "1.0000001", "1e-3", " 0.1"])(
    "rejects invalid price %s",
    (price) => expect(() => usdcToAtomic(price)).toThrow("INVALID_USDC_PRICE"),
  );
});

describe("paid skill configuration", () => {
  it("requires an example input accepted by the input schema", () => {
    const missing = paidSkillConfig() as unknown as Record<string, unknown>;
    delete missing.exampleInput;

    expect(() => validatePaidSkillConfig(missing)).toThrow(
      "INVALID_PAID_SKILL_CONFIG",
    );
    expect(() =>
      validatePaidSkillConfig(paidSkillConfig({ exampleInput: 42 as never })),
    ).toThrow("INVALID_PAID_SKILL_CONFIG");
  });

  it("rejects an example input when schema validation throws", () => {
    expect(() =>
      validatePaidSkillConfig(
        paidSkillConfig({
          input: {
            safeParse() {
              throw new Error("schema crashed");
            },
          },
        }),
      ),
    ).toThrow("INVALID_PAID_SKILL_CONFIG");
  });

  it("validates the example after its JSON wire-format round trip", () => {
    const dateSchema: Schema<{ publishedAt: Date }> = {
      safeParse(value) {
        return typeof value === "object" &&
          value !== null &&
          (value as { publishedAt?: unknown }).publishedAt instanceof Date
          ? { success: true, data: value as { publishedAt: Date } }
          : { success: false, error: {} };
      },
    };

    expect(() =>
      validatePaidSkillConfig(
        paidSkillConfig({
          exampleInput: {
            publishedAt: new Date("2026-07-21T00:00:00Z"),
          } as never,
          input: dateSchema as Schema<string>,
        }),
      ),
    ).toThrow("INVALID_PAID_SKILL_CONFIG");
  });

  it("requires a JSON-serializable example input", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    for (const exampleInput of [undefined, 1n, circular]) {
      expect(() =>
        validatePaidSkillConfig(
          paidSkillConfig({
            exampleInput: exampleInput as never,
            input: unknownSchema as Schema<string>,
          }),
        ),
      ).toThrow("INVALID_PAID_SKILL_CONFIG");
    }
  });

  it("limits the serialized example input to the 32 KiB route contract", () => {
    expect(() =>
      validatePaidSkillConfig(
        paidSkillConfig({ exampleInput: "a".repeat(32 * 1024 - 2) }),
      ),
    ).not.toThrow();
    expect(() =>
      validatePaidSkillConfig(
        paidSkillConfig({ exampleInput: "a".repeat(32 * 1024 - 1) }),
      ),
    ).toThrow("INVALID_PAID_SKILL_CONFIG");
    expect(() =>
      validatePaidSkillConfig(
        paidSkillConfig({ exampleInput: "💳".repeat(8_192) }),
      ),
    ).toThrow("INVALID_PAID_SKILL_CONFIG");
  });

  it.each([
    ["invalid kebab-case name", { name: "Summarize_Report" }],
    ["blank description", { description: "   " }],
    ["wrong endpoint path", { endpointPath: "/api/other" }],
    ["zero payee", { payTo: "0x0000000000000000000000000000000000000000" }],
    ["non-address payee", { payTo: "not-an-address" }],
    ["unsupported network", { network: "ethereum" }],
    ["timeout below minimum", { timeoutMs: 999 }],
    ["timeout above maximum", { timeoutMs: 45_001 }],
    ["invalid price", { price: "1e-3" }],
  ] as const)("rejects %s", (_caseName, overrides) => {
    expect(() => validatePaidSkillConfig(paidSkillConfig(overrides))).toThrow();
  });

  it("requires an explicit facilitator URL on Base Mainnet", () => {
    expect(() =>
      validatePaidSkillConfig(paidSkillConfig({ network: "base" })),
    ).toThrow("INVALID_PAID_SKILL_CONFIG");
    expect(() => definePaidSkill(paidSkillConfig({ network: "base" }))).toThrow(
      "INVALID_PAID_SKILL_CONFIG",
    );
  });

  it.each([
    "https://x402.org/facilitator",
    "https://x402.org:443/facilitator",
    "HTTPS://X402.ORG/facilitator",
    "https://x402.org/facilitator/",
  ])(
    "rejects the testnet facilitator alias %s on Base Mainnet",
    (facilitatorUrl) => {
      expect(() =>
        validatePaidSkillConfig(
          paidSkillConfig({ network: "base", facilitatorUrl }),
        ),
      ).toThrow();
    },
  );

  it("normalizes defaults and freezes the defined skill", () => {
    const skill = definePaidSkill(paidSkillConfig());

    expect(skill.timeoutMs).toBe(45_000);
    expect(skill.facilitatorUrl).toBe("https://x402.org/facilitator");
    expect(Object.isFrozen(skill)).toBe(true);
  });
});
