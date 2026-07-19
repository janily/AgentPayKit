import {
  assertExactFields,
  packageDigest,
  parsePackageDigest,
  parseReleaseId,
  verifyCanonicalSignature,
  type CanonicalSignature,
  type PackageDigest,
  type ReleaseId,
} from "@agentpaykit/protocol";

export interface InstalledReleasePayload {
  schemaVersion: "1";
  releaseId: ReleaseId;
  packageDigest: PackageDigest;
  environment: "testnet" | "mainnet";
  runtimeUrl: string;
  runtimeKeyId: string;
  runtimePublicKey: string;
}

export interface InstalledSkill {
  packageBytes: Uint8Array;
  release: {
    payload: InstalledReleasePayload;
    signature: CanonicalSignature;
  };
  publisher: { keyId: string; publicKey: Uint8Array };
}

export interface VerifiedInstalledSkill {
  releaseId: ReleaseId;
  packageDigest: PackageDigest;
  environment: "testnet" | "mainnet";
  runtime: { url: string; keyId: string; publicKey: Uint8Array };
}

export class ClientContractError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ClientContractError";
  }
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ClientContractError("INVALID_RUNTIME_IDENTITY");
  }
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) =>
    character.charCodeAt(0),
  );
}

export class StrictReleaseVerifier {
  async verify(skill: InstalledSkill): Promise<VerifiedInstalledSkill> {
    const payload = skill.release.payload as unknown as Record<string, unknown>;
    try {
      assertExactFields(payload, [
        "schemaVersion",
        "releaseId",
        "packageDigest",
        "environment",
        "runtimeUrl",
        "runtimeKeyId",
        "runtimePublicKey",
      ]);
      if (payload.schemaVersion !== "1") throw new Error();
      const releaseId = parseReleaseId(payload.releaseId);
      const expectedPackageDigest = parsePackageDigest(payload.packageDigest);
      if (
        payload.environment !== "testnet" &&
        payload.environment !== "mainnet"
      ) {
        throw new Error();
      }
      if (
        typeof payload.runtimeUrl !== "string" ||
        new URL(payload.runtimeUrl).protocol !== "https:"
      ) {
        throw new Error();
      }
      if (
        typeof payload.runtimeKeyId !== "string" ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(payload.runtimeKeyId) ||
        typeof payload.runtimePublicKey !== "string"
      ) {
        throw new Error();
      }
      const runtimePublicKey = decodeBase64Url(payload.runtimePublicKey);
      if (runtimePublicKey.byteLength !== 32) throw new Error();
      if ((await packageDigest(skill.packageBytes)) !== expectedPackageDigest) {
        throw new ClientContractError("PACKAGE_DIGEST_MISMATCH");
      }
      if (
        skill.release.signature.keyId !== skill.publisher.keyId ||
        !(await verifyCanonicalSignature(
          "release-v1",
          skill.release.payload,
          skill.release.signature,
          skill.publisher.publicKey,
        ))
      ) {
        throw new ClientContractError("INVALID_RELEASE_SIGNATURE");
      }
      return {
        releaseId,
        packageDigest: expectedPackageDigest,
        environment: payload.environment,
        runtime: {
          url: new URL(payload.runtimeUrl).origin,
          keyId: payload.runtimeKeyId,
          publicKey: runtimePublicKey,
        },
      };
    } catch (error) {
      if (error instanceof ClientContractError) throw error;
      throw new ClientContractError("INVALID_RELEASE");
    }
  }
}
