import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { getDefaultAsset } from "@x402/evm";
import { describe, expect, it, vi } from "vitest";

vi.mock("../agentpay.skill.js", async () => {
  const { definePaidSkill } = await import("@agentpaykit/server");
  const inputSchema = {
    safeParse(value: unknown) {
      return typeof value === "object" &&
        value !== null &&
        typeof (value as { prompt?: unknown }).prompt === "string"
        ? { success: true as const, data: value }
        : { success: false as const, error: {} };
    },
  };
  const outputSchema = {
    safeParse(value: unknown) {
      return { success: true as const, data: value };
    },
  };

  return {
    default: definePaidSkill({
      name: "deploy-test",
      description: "Reviews a public GitHub repository.",
      endpointPath: "/api/invoke",
      price: "0.05",
      network: "base-sepolia",
      payTo: "0x1111111111111111111111111111111111111111",
      exampleInput: { prompt: "configured probe" },
      input: inputSchema,
      output: outputSchema,
      async execute(input) {
        return input;
      },
    }),
  };
});

import { deploySkill } from "../scripts/lib/deploy.js";
import skill from "../agentpay.skill.js";

const ORIGIN = "https://paid-review-abc.vercel.app";
const ENDPOINT = `${ORIGIN}/api/invoke`;
const PAYEE = "0x1111111111111111111111111111111111111111";
const ASSET = getDefaultAsset("eip155:84532").address.toLowerCase();

type Run = (argv: string[], cwd: string) => Promise<string>;

function paymentRequired(
  overrides: Partial<PaymentRequired> = {},
): PaymentRequired {
  return {
    x402Version: 2,
    resource: {
      url: ENDPOINT,
      description: "Reviews a public GitHub repository.",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:84532",
        asset: ASSET,
        amount: "50000",
        payTo: PAYEE,
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      },
    ],
    ...overrides,
  };
}

function challengeResponse(challenge = paymentRequired()): Response {
  return new Response(null, {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": encodePaymentRequiredHeader(challenge),
    },
  });
}

function successfulRun(stdout = ORIGIN) {
  return vi.fn<Run>(async (argv) => (argv[0] === "vercel" ? stdout : ""));
}

describe("deploySkill", () => {
  it("checks, deploys once, verifies the quote, then writes SKILL.md", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentpaykit-deploy-"));
    const run = successfulRun();
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      challengeResponse(),
    );

    await expect(deploySkill({ run, fetch, cwd })).resolves.toEqual({
      origin: ORIGIN,
      endpoint: ENDPOINT,
    });

    expect(run.mock.calls).toEqual([
      [["pnpm", "test"], cwd],
      [["pnpm", "typecheck"], cwd],
      [["pnpm", "build"], cwd],
      [["vercel", "deploy", "--prod", "--yes"], cwd],
    ]);
    expect(
      run.mock.calls.filter(([argv]) => argv[0] === "vercel"),
    ).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "configured probe",
      }),
    });
    await expect(
      readFile(join(cwd, "skill", "SKILL.md"), "utf8"),
    ).resolves.toContain(`agentpay call ${ENDPOINT}`);
  });

  it.each([
    ["non-HTTPS", "http://paid-review-abc.vercel.app"],
    ["multi-line", `${ORIGIN}\nhttps://other.vercel.app`],
    ["malformed", "not a url"],
  ])(
    "rejects %s Vercel stdout without writing SKILL.md",
    async (_case, stdout) => {
      const cwd = await mkdtemp(join(tmpdir(), "agentpaykit-deploy-"));
      const run = successfulRun(stdout);
      const fetch = vi.fn<typeof globalThis.fetch>();

      await expect(deploySkill({ run, fetch, cwd })).rejects.toThrow(
        "INVALID_VERCEL_DEPLOYMENT_URL",
      );

      expect(
        run.mock.calls.filter(([argv]) => argv[0] === "vercel"),
      ).toHaveLength(1);
      expect(fetch).not.toHaveBeenCalled();
      await expect(access(join(cwd, "skill", "SKILL.md"))).rejects.toThrow();
    },
  );

  it.each([
    [
      "network",
      paymentRequired({
        accepts: [
          {
            ...paymentRequired().accepts[0],
            network: "eip155:8453",
          },
        ],
      }),
    ],
    [
      "price",
      paymentRequired({
        accepts: [{ ...paymentRequired().accepts[0], amount: "50001" }],
      }),
    ],
    [
      "payee",
      paymentRequired({
        accepts: [
          {
            ...paymentRequired().accepts[0],
            payTo: "0x2222222222222222222222222222222222222222",
          },
        ],
      }),
    ],
    [
      "asset",
      paymentRequired({
        accepts: [
          {
            ...paymentRequired().accepts[0],
            asset: "0x2222222222222222222222222222222222222222",
          },
        ],
      }),
    ],
    [
      "resource URL",
      paymentRequired({
        resource: {
          ...paymentRequired().resource,
          url: `${ORIGIN}/api/other`,
        },
      }),
    ],
  ])(
    "leaves the deployment but writes no SKILL.md on %s mismatch",
    async (_field, challenge) => {
      const cwd = await mkdtemp(join(tmpdir(), "agentpaykit-deploy-"));
      const run = successfulRun();
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        challengeResponse(challenge),
      );

      const error = await deploySkill({ run, fetch, cwd }).catch(
        (reason: unknown) => reason,
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("DEPLOYED_QUOTE_MISMATCH");
      expect((error as Error).message).toContain(
        "deployment exists but publication verification failed",
      );
      expect(
        run.mock.calls.filter(([argv]) => argv[0] === "vercel"),
      ).toHaveLength(1);
      await expect(access(join(cwd, "skill", "SKILL.md"))).rejects.toThrow();
    },
  );

  it.each([
    ["a non-402 response", new Response(null, { status: 500 })],
    ["a missing PAYMENT-REQUIRED header", new Response(null, { status: 402 })],
    [
      "a malformed PAYMENT-REQUIRED header",
      new Response(null, {
        status: 402,
        headers: { "PAYMENT-REQUIRED": "not-base64" },
      }),
    ],
    [
      "a structurally invalid PAYMENT-REQUIRED header",
      new Response(null, {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": Buffer.from("null").toString("base64"),
        },
      }),
    ],
  ])("does not publish SKILL.md for %s", async (_case, response) => {
    const cwd = await mkdtemp(join(tmpdir(), "agentpaykit-deploy-"));
    const run = successfulRun();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response);

    await expect(deploySkill({ run, fetch, cwd })).rejects.toThrow(
      "DEPLOYED_QUOTE_MISMATCH",
    );

    await expect(access(join(cwd, "skill", "SKILL.md"))).rejects.toThrow();
  });

  it("rejects an invalid configured example before running any command", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentpaykit-deploy-"));
    const run = successfulRun();
    const fetch = vi.fn<typeof globalThis.fetch>();
    const safeParse = vi
      .spyOn(skill.input, "safeParse")
      .mockReturnValueOnce({ success: false, error: {} });

    try {
      await expect(deploySkill({ run, fetch, cwd })).rejects.toThrow(
        "INVALID_PAID_SKILL_CONFIG",
      );
      expect(run).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      safeParse.mockRestore();
    }
  });

  it("rejects an example whose JSON wire value fails the schema before run", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentpaykit-deploy-"));
    const run = successfulRun();
    const fetch = vi.fn<typeof globalThis.fetch>();
    const exampleInput = skill.exampleInput as unknown as {
      repository?: unknown;
    };
    const originalRepository = exampleInput.repository;
    exampleInput.repository = new Date("2026-07-21T00:00:00Z");
    const safeParse = vi
      .spyOn(skill.input, "safeParse")
      .mockImplementation((value: unknown) =>
        typeof value === "object" &&
        value !== null &&
        (value as { repository?: unknown }).repository instanceof Date
          ? { success: true, data: value as { repository: string } }
          : { success: false, error: {} },
      );

    try {
      await expect(deploySkill({ run, fetch, cwd })).rejects.toThrow(
        "INVALID_PAID_SKILL_CONFIG",
      );
      expect(run).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      safeParse.mockRestore();
      if (originalRepository === undefined) {
        delete exampleInput.repository;
      } else {
        exampleInput.repository = originalRepository;
      }
    }
  });
});
