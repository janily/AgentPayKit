import {
  canonicalBytes,
  parsePackageDigest,
  parseReleaseId,
  sha256,
  type PackageDigest,
  type ReleaseId,
} from "@agentpaykit/protocol";

import type { RuntimeDelegation } from "./delegation";

export interface ReleaseBody {
  schemaVersion: "1";
  packageDigest: PackageDigest;
  environment: "testnet" | "mainnet";
  network: "eip155:84532" | "eip155:8453";
  publisher: `0x${string}`;
  payee: `0x${string}`;
  amount: string;
  asset: `0x${string}`;
  runtimeDelegation: RuntimeDelegation;
  issuedAt: string;
  expiresAt: string;
}

export interface ReleasePayload extends ReleaseBody {
  releaseId: ReleaseId;
}

export async function buildRelease(
  input: ReleaseBody,
): Promise<ReleasePayload> {
  if (
    (input.environment === "testnet" && input.network !== "eip155:84532") ||
    (input.environment === "mainnet" && input.network !== "eip155:8453") ||
    input.runtimeDelegation.payload.environment !== input.environment ||
    input.runtimeDelegation.payload.network !== input.network
  ) {
    throw new Error("RELEASE_NETWORK_MISMATCH");
  }
  parsePackageDigest(input.packageDigest);
  const digest = await sha256(
    canonicalBytes({ domain: "agentpaykit:release-id-v1", release: input }),
  );
  return {
    ...input,
    releaseId: parseReleaseId(`rel_${digest.slice("sha256:".length)}`),
  };
}

export function releaseSigningMessage(payload: ReleasePayload): string {
  return `agentpaykit:release-v1\n${new TextDecoder().decode(canonicalBytes(payload))}`;
}
