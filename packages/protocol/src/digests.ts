import { canonicalBytes } from "./canonical-json";
import type { InputDigest, PackageDigest } from "./ids";

function hexadecimal(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function sha256(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return `sha256:${hexadecimal(await crypto.subtle.digest("SHA-256", copy.buffer))}`;
}

export function digestJson(value: unknown): Promise<`sha256:${string}`> {
  return sha256(canonicalBytes(value));
}

export async function inputDigest(value: unknown): Promise<InputDigest> {
  return (await digestJson(value)) as InputDigest;
}

export async function packageDigest(bytes: Uint8Array): Promise<PackageDigest> {
  return (await sha256(bytes)) as PackageDigest;
}
