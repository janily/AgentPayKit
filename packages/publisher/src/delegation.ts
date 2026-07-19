import {
  signCanonical,
  verifyCanonicalSignature,
  type CanonicalSignature,
} from "@agentpaykit/protocol";

export interface RuntimeDelegationPayload {
  schemaVersion: "1";
  environment: "testnet" | "mainnet";
  network: "eip155:84532" | "eip155:8453";
  runtimeUrl: string;
  runtimeKeyId: string;
  runtimePublicKey: string;
  issuedAt: string;
  expiresAt: string;
}

export interface RuntimeDelegation {
  payload: RuntimeDelegationPayload;
  signature: CanonicalSignature;
}

export async function signRuntimeDelegation(
  payload: RuntimeDelegationPayload,
  signer: { keyId: string; privateKeySeed: Uint8Array },
): Promise<RuntimeDelegation> {
  if (payload.runtimeKeyId !== signer.keyId) {
    throw new Error("DELEGATION_KEY_MISMATCH");
  }
  return {
    payload,
    signature: await signCanonical("runtime-delegation-v1", payload, signer),
  };
}

export async function verifyRuntimeDelegation(
  delegation: RuntimeDelegation,
  now = new Date(),
): Promise<boolean> {
  const payload = delegation.payload;
  if (
    payload.schemaVersion !== "1" ||
    (payload.environment === "testnet"
      ? payload.network !== "eip155:84532"
      : payload.environment !== "mainnet" ||
        payload.network !== "eip155:8453") ||
    new Date(payload.expiresAt).getTime() <= now.getTime() ||
    new Date(payload.issuedAt).getTime() >=
      new Date(payload.expiresAt).getTime() ||
    delegation.signature.keyId !== payload.runtimeKeyId
  ) {
    return false;
  }
  return verifyCanonicalSignature(
    "runtime-delegation-v1",
    payload,
    delegation.signature,
    Uint8Array.from(Buffer.from(payload.runtimePublicKey, "base64url")),
  );
}
