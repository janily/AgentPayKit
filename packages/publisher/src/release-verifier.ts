import { canonicalBytes, parseReleaseId, sha256 } from "@agentpaykit/protocol";
import { getAddress, recoverMessageAddress } from "viem";

import { verifyRuntimeDelegation } from "./delegation";
import { releaseSigningMessage, type ReleaseBody } from "./release-builder";
import type { SignedRelease } from "./release-signer";

export class ReleaseVerificationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ReleaseVerificationError";
  }
}

export async function verifyRelease(
  release: SignedRelease,
  options: { now?: Date; packageBytes?: Uint8Array } = {},
): Promise<void> {
  const { releaseId, ...body } = release.payload;
  const now = options.now ?? new Date();
  if (
    release.payload.schemaVersion !== "1" ||
    !/^(0|[1-9][0-9]*)$/.test(release.payload.amount) ||
    new Date(release.payload.expiresAt).getTime() <= now.getTime() ||
    new Date(release.payload.issuedAt).getTime() >=
      new Date(release.payload.expiresAt).getTime() ||
    (release.payload.environment === "testnet"
      ? release.payload.network !== "eip155:84532"
      : release.payload.environment !== "mainnet" ||
        release.payload.network !== "eip155:8453")
  ) {
    throw new ReleaseVerificationError("INVALID_RELEASE");
  }
  const digest = await sha256(
    canonicalBytes({
      domain: "agentpaykit:release-id-v1",
      release: body as ReleaseBody,
    }),
  );
  if (parseReleaseId(`rel_${digest.slice(7)}`) !== releaseId) {
    throw new ReleaseVerificationError("RELEASE_ID_MISMATCH");
  }
  if (
    options.packageBytes &&
    (await sha256(options.packageBytes)) !== release.payload.packageDigest
  ) {
    throw new ReleaseVerificationError("PACKAGE_DIGEST_MISMATCH");
  }
  if (
    !(await verifyRuntimeDelegation(release.payload.runtimeDelegation, now))
  ) {
    throw new ReleaseVerificationError("INVALID_RUNTIME_DELEGATION");
  }
  const recovered = await recoverMessageAddress({
    message: releaseSigningMessage(release.payload),
    signature: release.signature.value,
  });
  if (
    release.signature.algorithm !== "EIP191" ||
    getAddress(recovered) !== getAddress(release.signature.signer) ||
    getAddress(recovered) !== getAddress(release.payload.payee)
  ) {
    throw new ReleaseVerificationError("INVALID_PUBLISHER_SIGNATURE");
  }
}
