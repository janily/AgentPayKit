import { packageDigest, signCanonical } from "@agentpaykit/protocol";
import { describe, expect, test } from "vitest";

import {
  StrictReleaseVerifier,
  type InstalledSkill,
} from "../src/release-verifier";

const privateKeySeed =
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const publicKey =
  "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";

function hex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function fixture(): Promise<InstalledSkill> {
  const packageBytes = new TextEncoder().encode("immutable skill package");
  const payload = {
    schemaVersion: "1" as const,
    releaseId: `rel_${"a".repeat(64)}`,
    packageDigest: await packageDigest(packageBytes),
    environment: "testnet" as const,
    runtimeUrl: "https://runtime.agentpay.test",
    runtimeKeyId: "runtime-2026-07",
    runtimePublicKey: base64Url(hex(publicKey)),
  };
  return {
    packageBytes,
    release: {
      payload: payload as InstalledSkill["release"]["payload"],
      signature: await signCanonical("release-v1", payload, {
        keyId: "publisher-test-key",
        privateKeySeed: hex(privateKeySeed),
      }),
    },
    publisher: {
      keyId: "publisher-test-key",
      publicKey: hex(publicKey),
    },
  };
}

describe("StrictReleaseVerifier", () => {
  test("binds immutable package, publisher signature and runtime identity", async () => {
    const skill = await fixture();

    await expect(
      new StrictReleaseVerifier().verify(skill),
    ).resolves.toMatchObject({
      releaseId: skill.release.payload.releaseId,
      packageDigest: skill.release.payload.packageDigest,
      runtime: {
        url: "https://runtime.agentpay.test",
        keyId: "runtime-2026-07",
      },
    });
  });

  test("rejects a one-byte package mutation", async () => {
    const skill = await fixture();
    skill.packageBytes[0] ^= 1;

    await expect(
      new StrictReleaseVerifier().verify(skill),
    ).rejects.toMatchObject({
      code: "PACKAGE_DIGEST_MISMATCH",
    });
  });
});
