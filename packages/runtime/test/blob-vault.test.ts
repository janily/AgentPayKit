import { describe, expect, test, vi } from "vitest";

import { EncryptedBlobVault } from "../src/blob-vault";

describe("application-level encrypted blob vault", () => {
  test("uses a fresh 96-bit nonce and never writes plaintext to R2", async () => {
    const objects = new Map<string, Uint8Array>();
    const bucket = {
      put: vi.fn(async (key: string, value: Uint8Array) => {
        objects.set(key, value);
      }),
      get: vi.fn(async (key: string) => objects.get(key)),
      delete: vi.fn(async (key: string) => {
        objects.delete(key);
      }),
    };
    let nonce = 0;
    const vault = new EncryptedBlobVault({
      bucket,
      keyring: {
        current: async () => ({
          version: "k1",
          key: new Uint8Array(32).fill(7),
        }),
        byVersion: async () => new Uint8Array(32).fill(7),
      },
      nonce: () => new Uint8Array(12).fill(nonce++),
    });

    const first = await vault.putJson("invocation/input", {
      secret: "raw-input-marker",
    });
    const second = await vault.putJson("invocation/payment", {
      secret: "payment-payload-marker",
    });

    expect(first.digest).toMatch(/^sha256:/);
    expect(first.digest).not.toBe(second.digest);
    expect(new TextDecoder().decode(objects.get(first.key))).not.toContain(
      "raw-input-marker",
    );
    expect(new TextDecoder().decode(objects.get(second.key))).not.toContain(
      "payment-payload-marker",
    );
    await expect(vault.getJson(first.key)).resolves.toEqual({
      secret: "raw-input-marker",
    });
  });
});
