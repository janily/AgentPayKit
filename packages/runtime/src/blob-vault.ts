import { sha256 } from "@agentpaykit/protocol";

interface BlobBucket {
  put(key: string, value: Uint8Array): Promise<unknown>;
  get(key: string): Promise<Uint8Array | undefined>;
  delete(key: string): Promise<unknown>;
}

interface VaultKeyring {
  current(): Promise<{ version: string; key: Uint8Array }>;
  byVersion(version: string): Promise<Uint8Array>;
}

interface EncryptedEnvelope {
  version: "1";
  algorithm: "AES-256-GCM";
  keyVersion: string;
  nonce: string;
  ciphertext: string;
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function importAesKey(
  bytes: Uint8Array,
  usages: Array<"encrypt" | "decrypt">,
): Promise<CryptoKey> {
  if (bytes.byteLength !== 32)
    throw new TypeError("vault key must be exactly 256 bits");
  return crypto.subtle.importKey(
    "raw",
    arrayBuffer(bytes),
    { name: "AES-GCM" },
    false,
    usages,
  );
}

function aad(key: string, keyVersion: string): Uint8Array {
  return new TextEncoder().encode(`agentpaykit-blob-v1\n${key}\n${keyVersion}`);
}

export class EncryptedBlobVault {
  private readonly nonce: () => Uint8Array;

  constructor(
    private readonly options: {
      bucket: BlobBucket;
      keyring: VaultKeyring;
      nonce?: () => Uint8Array;
    },
  ) {
    this.nonce =
      options.nonce ?? (() => crypto.getRandomValues(new Uint8Array(12)));
  }

  async putJson(
    key: string,
    value: unknown,
  ): Promise<{ key: string; digest: `sha256:${string}` }> {
    const { version: keyVersion, key: rawKey } =
      await this.options.keyring.current();
    const nonce = this.nonce();
    if (nonce.byteLength !== 12)
      throw new TypeError("AES-GCM nonce must be 96 bits");
    const encryptionKey = await importAesKey(rawKey, ["encrypt"]);
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: arrayBuffer(nonce),
        additionalData: arrayBuffer(aad(key, keyVersion)),
      },
      encryptionKey,
      arrayBuffer(plaintext),
    );
    const envelope: EncryptedEnvelope = {
      version: "1",
      algorithm: "AES-256-GCM",
      keyVersion,
      nonce: base64Url(nonce),
      ciphertext: base64Url(new Uint8Array(ciphertext)),
    };
    const bytes = new TextEncoder().encode(JSON.stringify(envelope));
    await this.options.bucket.put(key, bytes);
    return { key, digest: await sha256(bytes) };
  }

  async getJson(key: string): Promise<unknown> {
    const bytes = await this.options.bucket.get(key);
    if (!bytes) throw new Error("encrypted blob not found");
    const envelope = JSON.parse(
      new TextDecoder().decode(bytes),
    ) as Partial<EncryptedEnvelope>;
    if (
      envelope.version !== "1" ||
      envelope.algorithm !== "AES-256-GCM" ||
      typeof envelope.keyVersion !== "string" ||
      typeof envelope.nonce !== "string" ||
      typeof envelope.ciphertext !== "string"
    ) {
      throw new Error("invalid encrypted blob envelope");
    }
    const nonce = fromBase64Url(envelope.nonce);
    if (nonce.byteLength !== 12)
      throw new Error("invalid encrypted blob nonce");
    const decryptionKey = await importAesKey(
      await this.options.keyring.byVersion(envelope.keyVersion),
      ["decrypt"],
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: arrayBuffer(nonce),
        additionalData: arrayBuffer(aad(key, envelope.keyVersion)),
      },
      decryptionKey,
      arrayBuffer(fromBase64Url(envelope.ciphertext)),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
  }

  delete(key: string): Promise<unknown> {
    return this.options.bucket.delete(key);
  }
}
