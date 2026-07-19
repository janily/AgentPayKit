import { canonicalJson } from "./canonical-json";

export type SignatureDomain =
  | "runtime-quote-v1"
  | "runtime-status-v1"
  | "runtime-result-v1"
  | "runtime-receipt-v1"
  | "release-v1";

export interface CanonicalSignature {
  algorithm: "Ed25519";
  keyId: string;
  value: string;
}

export interface SignedEnvelope<Payload> {
  payload: Payload;
  signature: CanonicalSignature;
}

const PKCS8_ED25519_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04,
  0x22, 0x04, 0x20,
]);

function concatenate(left: Uint8Array, right: Uint8Array): Uint8Array {
  const output = new Uint8Array(left.length + right.length);
  output.set(left);
  output.set(right, left.length);
  return output;
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function base64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value))
    throw new TypeError("invalid base64url signature");
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export function signaturePayload(
  domain: SignatureDomain,
  payload: unknown,
): Uint8Array {
  return new TextEncoder().encode(
    `agentpaykit:${domain}\n${canonicalJson(payload)}`,
  );
}

export async function signCanonical(
  domain: SignatureDomain,
  payload: unknown,
  signer: { keyId: string; privateKeySeed: Uint8Array },
): Promise<CanonicalSignature> {
  if (signer.privateKeySeed.byteLength !== 32)
    throw new TypeError("Ed25519 private key seed must be 32 bytes");
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(signer.keyId))
    throw new TypeError("invalid keyId");
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    arrayBuffer(concatenate(PKCS8_ED25519_PREFIX, signer.privateKeySeed)),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "Ed25519",
    privateKey,
    arrayBuffer(signaturePayload(domain, payload)),
  );
  return {
    algorithm: "Ed25519",
    keyId: signer.keyId,
    value: base64Url(signature),
  };
}

export async function verifyCanonicalSignature(
  domain: SignatureDomain,
  payload: unknown,
  signature: CanonicalSignature,
  publicKeyBytes: Uint8Array,
): Promise<boolean> {
  if (signature.algorithm !== "Ed25519" || publicKeyBytes.byteLength !== 32)
    return false;
  const publicKey = await crypto.subtle.importKey(
    "raw",
    arrayBuffer(publicKeyBytes),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "Ed25519",
    publicKey,
    arrayBuffer(fromBase64Url(signature.value)),
    arrayBuffer(signaturePayload(domain, payload)),
  );
}
