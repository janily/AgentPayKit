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
} from "../../../packages/publisher/src/index";
import { privateKeyToAccount } from "viem/accounts";

const testSeed = Uint8Array.from({ length: 32 }, (_, index) => 32 - index);
const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
const runtimePublicKey = createPublicKey(
  createPrivateKey({
    key: Buffer.concat([pkcs8Prefix, testSeed]),
    format: "der",
    type: "pkcs8",
  }),
)
  .export({ format: "der", type: "spki" })
  .subarray(-32)
  .toString("base64url");
const testOnlyWallet = privateKeyToAccount(`0x${"abcdef".repeat(10)}abcd`);

export async function securityPackageFixture() {
  const project = await mkdtemp(join(tmpdir(), "agentpay-security-package-"));
  await writeFile(
    join(project, "agentpay.json"),
    JSON.stringify({
      schemaVersion: "1",
      name: "security-fixture",
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
      runtimeUrl: "https://runtime.example.test",
      runtimeKeyId: "runtime-security-fixture",
      runtimePublicKey,
      issuedAt: "2026-07-19T00:00:00.000Z",
      expiresAt: "2026-09-19T00:00:00.000Z",
    },
    { keyId: "runtime-security-fixture", privateKeySeed: testSeed },
  );
  const payload = await buildRelease({
    schemaVersion: "1",
    packageDigest: prepared.digest,
    environment: "testnet",
    network: "eip155:84532",
    publisher: "0x1111111111111111111111111111111111111111",
    payee: testOnlyWallet.address,
    amount: "10000",
    asset: "0x2222222222222222222222222222222222222222",
    runtimeDelegation: delegation,
    issuedAt: "2026-07-19T00:00:00.000Z",
    expiresAt: "2026-09-19T00:00:00.000Z",
  });
  const release = await signRelease(payload, testOnlyWallet);
  return {
    ...(await buildSkillPackage({ root: project, release })),
    releaseId: release.payload.releaseId,
  };
}
