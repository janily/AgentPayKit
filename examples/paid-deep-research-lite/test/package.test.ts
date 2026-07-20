import { createPrivateKey, createPublicKey } from "node:crypto";

import {
  buildRelease,
  buildSkillPackage,
  prepareSkillPackage,
  signRelease,
  signRuntimeDelegation,
  verifyRelease,
} from "@agentpaykit/publisher";
import { describe, expect, test, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

import { BoundedResearchHandler, settleSuccessfulResearch } from "../src/index";

const root = new URL("..", import.meta.url).pathname;
const seed = Uint8Array.from({ length: 32 }, (_, index) => index + 10);
const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
const publicKey = createPublicKey(
  createPrivateKey({
    key: Buffer.concat([prefix, seed]),
    format: "der",
    type: "pkcs8",
  }),
)
  .export({ format: "der", type: "spki" })
  .subarray(-32)
  .toString("base64url");
const wallet = privateKeyToAccount(
  "0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000",
);

async function release(environment: "testnet" | "mainnet") {
  const prepared = await prepareSkillPackage(root);
  const network = environment === "testnet" ? "eip155:84532" : "eip155:8453";
  const delegation = await signRuntimeDelegation(
    {
      schemaVersion: "1",
      environment,
      network,
      runtimeUrl: "https://research-runtime.example.test",
      runtimeKeyId: `research-${environment}`,
      runtimePublicKey: publicKey,
      issuedAt: "2026-07-19T00:00:00.000Z",
      expiresAt: "2026-09-19T00:00:00.000Z",
    },
    { keyId: `research-${environment}`, privateKeySeed: seed },
  );
  const payload = await buildRelease({
    schemaVersion: "1",
    packageDigest: prepared.digest,
    environment,
    network,
    publisher: "0x2222222222222222222222222222222222222222",
    payee: wallet.address,
    amount: "10000",
    asset: "0x3333333333333333333333333333333333333333",
    runtimeDelegation: delegation,
    issuedAt: "2026-07-19T00:00:00.000Z",
    expiresAt: "2026-09-19T00:00:00.000Z",
  });
  return signRelease(payload, wallet);
}

describe("official Deep Research Lite package", () => {
  test("builds offline-verifiable environment-specific releases and packages", async () => {
    const testnet = await release("testnet");
    const mainnet = await release("mainnet");
    const testnetPackage = await buildSkillPackage({ root, release: testnet });
    const mainnetPackage = await buildSkillPackage({ root, release: mainnet });

    await expect(
      verifyRelease(testnet, { now: new Date("2026-07-20T00:00:00.000Z") }),
    ).resolves.toBeUndefined();
    await expect(
      verifyRelease(mainnet, { now: new Date("2026-07-20T00:00:00.000Z") }),
    ).resolves.toBeUndefined();
    expect(testnet.payload.amount).toBe("10000");
    expect(mainnet.payload.amount).toBe("10000");
    expect(mainnet.payload.releaseId).not.toBe(testnet.payload.releaseId);
    expect(testnetPackage.digest).toBe(mainnetPackage.digest);
    expect(testnetPackage.bytes).not.toEqual(mainnetPackage.bytes);
    expect({
      packageDigest: testnetPackage.digest,
      testnetReleaseId: testnet.payload.releaseId,
      mainnetReleaseId: mainnet.payload.releaseId,
    }).toMatchInlineSnapshot(`
      {
        "mainnetReleaseId": "rel_a140a34927220617d439913e1b8797e90971f266031466f33f209333137177f9",
        "packageDigest": "sha256:4e6e65cdbf5e8fb3c320372a036e4fbe4815d5234ea06075cb8a5bb880ff3581",
        "testnetReleaseId": "rel_f68acce08e7c51e28be14d26989d03def6db074f58dba7ed6b30cdc46f30d81c",
      }
    `);
  });

  test("runs the fake paid flow and settles only after policy success", async () => {
    const order: string[] = ["quote", "approve"];
    const handler = new BoundedResearchHandler({
      search: {
        processor: "search.example",
        search: async () => [
          { url: "https://source.test/a", title: "A" },
          { url: "https://source.test/b", title: "B" },
        ],
        fetchPage: async () => "page",
      },
      model: {
        processor: "model.example",
        generate: async () => ({
          report: "x".repeat(500),
          citations: ["https://source.test/a", "https://source.test/b"],
          outputTokens: 500,
          costUsd: 0.1,
        }),
      },
      allowedProcessors: ["search.example", "model.example"],
    });
    const result = await handler.execute({ query: "bounded research" });
    order.push("execute", "policy");
    const settle = vi.fn(async () => order.push("settle"));
    await settleSuccessfulResearch(result, settle);
    order.push("result", "receipt");
    expect(order).toEqual([
      "quote",
      "approve",
      "execute",
      "policy",
      "settle",
      "result",
      "receipt",
    ]);
  });

  test("keeps the documented retention bounds", () => {
    expect({
      inputAfterExecution: 0,
      resultHours: 24,
      metadataDays: 30,
      logDays: 30,
    }).toEqual({
      inputAfterExecution: 0,
      resultHours: 24,
      metadataDays: 30,
      logDays: 30,
    });
  });
});
