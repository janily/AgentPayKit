import {
  verifyRelease,
  verifySkillPackageDigest,
  type SignedRelease,
} from "@agentpaykit/publisher";
import type { PackageDigest, ReleaseId } from "@agentpaykit/protocol";

export interface InstalledSkill {
  packageBytes: Uint8Array;
  release: SignedRelease;
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

function runtimePublicKey(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ClientContractError("INVALID_RUNTIME_IDENTITY");
  }
  const bytes = Uint8Array.from(Buffer.from(value, "base64url"));
  if (bytes.byteLength !== 32) {
    throw new ClientContractError("INVALID_RUNTIME_IDENTITY");
  }
  return bytes;
}

export class StrictReleaseVerifier {
  async verify(skill: InstalledSkill): Promise<VerifiedInstalledSkill> {
    let digestMatches = false;
    try {
      digestMatches = await verifySkillPackageDigest(
        skill.packageBytes,
        skill.release.payload.packageDigest,
      );
    } catch {
      digestMatches = false;
    }
    if (!digestMatches) {
      throw new ClientContractError("PACKAGE_DIGEST_MISMATCH");
    }
    try {
      await verifyRelease(skill.release);
    } catch (error) {
      throw new ClientContractError(
        typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
          ? error.code
          : "INVALID_RELEASE",
      );
    }
    const delegation = skill.release.payload.runtimeDelegation.payload;
    let runtimeUrl: URL;
    try {
      runtimeUrl = new URL(delegation.runtimeUrl);
    } catch {
      throw new ClientContractError("INVALID_RUNTIME_IDENTITY");
    }
    if (runtimeUrl.protocol !== "https:") {
      throw new ClientContractError("INVALID_RUNTIME_IDENTITY");
    }
    return {
      releaseId: skill.release.payload.releaseId,
      packageDigest: skill.release.payload.packageDigest,
      environment: skill.release.payload.environment,
      runtime: {
        url: runtimeUrl.origin,
        keyId: delegation.runtimeKeyId,
        publicKey: runtimePublicKey(delegation.runtimePublicKey),
      },
    };
  }
}
