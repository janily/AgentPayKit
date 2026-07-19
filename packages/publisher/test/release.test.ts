import { createPrivateKey, createPublicKey } from "node:crypto";

import { canonicalBytes, sha256 } from "@agentpaykit/protocol";
import { beforeAll, describe, expect, test } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

import {
  buildRelease,
  releaseSigningMessage,
  signRelease,
  signRuntimeDelegation,
  verifyRelease,
  type RuntimeDelegation,
} from "../src/index";

const runtimeSeed = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
const runtimePublicKey = createPublicKey(
  createPrivateKey({
    key: Buffer.concat([pkcs8Prefix, runtimeSeed]),
    format: "der",
    type: "pkcs8",
  }),
)
  .export({ format: "der", type: "spki" })
  .subarray(-32)
  .toString("base64url");
const wallet = privateKeyToAccount(
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const packageBytes = new TextEncoder().encode("deterministic-package-v1");
let delegation: RuntimeDelegation;

beforeAll(async () => {
  delegation = await signRuntimeDelegation(
    {
      schemaVersion: "1",
      environment: "testnet",
      network: "eip155:84532",
      runtimeUrl: "https://runtime.example.test",
      runtimeKeyId: "runtime-2026-01",
      runtimePublicKey,
      issuedAt: "2026-07-19T00:00:00.000Z",
      expiresAt: "2026-08-19T00:00:00.000Z",
    },
    { keyId: "runtime-2026-01", privateKeySeed: runtimeSeed },
  );
});

async function fixture(environment: "testnet" | "mainnet" = "testnet") {
  const body = {
    schemaVersion: "1" as const,
    packageDigest: await sha256(packageBytes),
    environment,
    network:
      environment === "testnet"
        ? ("eip155:84532" as const)
        : ("eip155:8453" as const),
    publisher: "0x1111111111111111111111111111111111111111" as const,
    payee: wallet.address,
    amount: "10000",
    asset: "0x2222222222222222222222222222222222222222" as const,
    runtimeDelegation: delegation,
    issuedAt: "2026-07-19T00:00:00.000Z",
    expiresAt: "2026-08-19T00:00:00.000Z",
  };
  const payload = await buildRelease(body);
  return signRelease(payload, wallet);
}

describe("immutable releases", () => {
  test("fixes canonical bytes, release id, wallet recovery and delegation", async () => {
    const first = await fixture();
    const second = await fixture();

    expect(canonicalBytes(first)).toEqual(canonicalBytes(second));
    expect({
      releaseId: first.payload.releaseId,
      signedDigest: await sha256(canonicalBytes(first)),
      signature: first.signature.value,
    }).toMatchInlineSnapshot(`
      {
        "releaseId": "rel_d9de82ce27417b7e7c1a4e7b1e44df4d83e47c8db94da40d5a447c1a88351622",
        "signature": "0x91ecd4a517d4ed2ea9618ee6a416b1902ad5ee75015036235c9f8f065fe32fbd3b3c37f5adaa85fd4f92993277b6c488cba762bdbc95dffc04bda29a08e790561b",
        "signedDigest": "sha256:21fa735b8b9e1b883324eaf02d597e5bb6a297e6c272b1acc0469f5cbff5828e",
      }
    `);
    expect(releaseSigningMessage(first.payload)).toContain(
      "agentpaykit:release-v1",
    );
    await expect(
      verifyRelease(first, {
        now: new Date("2026-07-20T00:00:00.000Z"),
        packageBytes,
      }),
    ).resolves.toBeUndefined();
  });

  test("rejects a one-byte package mutation and signed payload mutation", async () => {
    const release = await fixture();
    const tamperedPackage = Uint8Array.from(packageBytes);
    tamperedPackage[0] ^= 1;
    await expect(
      verifyRelease(release, {
        now: new Date("2026-07-20T00:00:00.000Z"),
        packageBytes: tamperedPackage,
      }),
    ).rejects.toMatchObject({ code: "PACKAGE_DIGEST_MISMATCH" });

    release.payload.amount = "10001";
    await expect(
      verifyRelease(release, { now: new Date("2026-07-20T00:00:00.000Z") }),
    ).rejects.toMatchObject({ code: "RELEASE_ID_MISMATCH" });
  });

  test("separates testnet/mainnet and refuses Sepolia delegation on mainnet", async () => {
    const testnet = await fixture("testnet");
    await expect(fixture("mainnet")).rejects.toThrow(
      "RELEASE_NETWORK_MISMATCH",
    );

    const mainnetDelegation = await signRuntimeDelegation(
      {
        ...delegation.payload,
        environment: "mainnet",
        network: "eip155:8453",
      },
      { keyId: "runtime-2026-01", privateKeySeed: runtimeSeed },
    );
    const { releaseId: _testnetReleaseId, ...testnetBody } = testnet.payload;
    const mainnet = await buildRelease({
      ...testnetBody,
      environment: "mainnet",
      network: "eip155:8453",
      runtimeDelegation: mainnetDelegation,
    });
    expect(mainnet.releaseId).not.toBe(testnet.payload.releaseId);
  });
});
