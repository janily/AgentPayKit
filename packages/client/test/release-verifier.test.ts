import { createPrivateKey, createPublicKey } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildRelease,
  buildSkillPackage,
  prepareSkillPackage,
  signRelease,
  signRuntimeDelegation,
} from "@agentpaykit/publisher";
import { describe, expect, test } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

import { StrictReleaseVerifier } from "../src/release-verifier";

const seed = Uint8Array.from({ length: 32 }, (_, index) => 32 - index);
const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
const runtimePublicKey = createPublicKey(
  createPrivateKey({
    key: Buffer.concat([pkcs8Prefix, seed]),
    format: "der",
    type: "pkcs8",
  }),
)
  .export({ format: "der", type: "spki" })
  .subarray(-32)
  .toString("base64url");
const testWallet = privateKeyToAccount(`0x${"1234".repeat(16)}`);

async function fixture() {
  const project = await mkdtemp(join(tmpdir(), "agentpay-client-release-"));
  await writeFile(
    join(project, "agentpay.json"),
    JSON.stringify({
      schemaVersion: "1",
      name: "client-fixture",
      files: ["handler.ts"],
    }),
  );
  await writeFile(join(project, "handler.ts"), "export default {}\n");
  const prepared = await prepareSkillPackage(project);
  const delegation = await signRuntimeDelegation(
    {
      schemaVersion: "1",
      environment: "testnet",
      network: "eip155:84532",
      runtimeUrl: "https://runtime.agentpay.test",
      runtimeKeyId: "runtime-2026-07",
      runtimePublicKey,
      issuedAt: "2026-07-19T00:00:00.000Z",
      expiresAt: "2027-09-19T00:00:00.000Z",
    },
    { keyId: "runtime-2026-07", privateKeySeed: seed },
  );
  const payload = await buildRelease({
    schemaVersion: "1",
    packageDigest: prepared.digest,
    environment: "testnet",
    network: "eip155:84532",
    publisher: "0x1111111111111111111111111111111111111111",
    payee: testWallet.address,
    amount: "10000",
    asset: "0x2222222222222222222222222222222222222222",
    runtimeDelegation: delegation,
    issuedAt: "2026-07-19T00:00:00.000Z",
    expiresAt: "2027-09-19T00:00:00.000Z",
  });
  const release = await signRelease(payload, testWallet);
  return {
    release,
    packageBytes: (await buildSkillPackage({ root: project, release })).bytes,
  };
}

describe("StrictReleaseVerifier", () => {
  test("verifies the published EIP-191 Release and delegated Runtime", async () => {
    const skill = await fixture();
    await expect(
      new StrictReleaseVerifier(
        () => new Date("2026-07-20T00:00:00.000Z"),
      ).verify(skill),
    ).resolves.toMatchObject({
      releaseId: skill.release.payload.releaseId,
      packageDigest: skill.release.payload.packageDigest,
      environment: "testnet",
      runtime: {
        url: "https://runtime.agentpay.test",
        keyId: "runtime-2026-07",
      },
    });
  });

  test("rejects a one-byte package mutation", async () => {
    const skill = await fixture();
    skill.packageBytes[520] ^= 1;
    await expect(
      new StrictReleaseVerifier(
        () => new Date("2026-07-20T00:00:00.000Z"),
      ).verify(skill),
    ).rejects.toMatchObject({
      code: "PACKAGE_DIGEST_MISMATCH",
    });
  });
});
