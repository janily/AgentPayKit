import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { releaseCommand } from "../src/commands/release";

test("builds an environment-bound unsigned release for external wallet signing", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentpay-release-cli-"));
  const bodyPath = join(root, "body.json");
  await writeFile(
    bodyPath,
    JSON.stringify({
      schemaVersion: "1",
      packageDigest: `sha256:${"a".repeat(64)}`,
      environment: "testnet",
      network: "eip155:84532",
      publisher: `0x${"1".repeat(40)}`,
      payee: `0x${"2".repeat(40)}`,
      amount: "10000",
      asset: `0x${"3".repeat(40)}`,
      runtimeDelegation: {
        payload: {
          schemaVersion: "1",
          environment: "testnet",
          network: "eip155:84532",
          runtimeUrl: "https://runtime.example.test",
          runtimeKeyId: "runtime-1",
          runtimePublicKey: "a".repeat(43),
          issuedAt: "2026-07-19T00:00:00.000Z",
          expiresAt: "2026-08-19T00:00:00.000Z",
        },
        signature: {
          algorithm: "Ed25519",
          keyId: "runtime-1",
          value: "a".repeat(86),
        },
      },
      issuedAt: "2026-07-19T00:00:00.000Z",
      expiresAt: "2026-08-19T00:00:00.000Z",
    }),
  );

  await expect(
    releaseCommand(["build", "--environment", "testnet", "--body", bodyPath]),
  ).resolves.toMatchObject({
    payload: { environment: "testnet", network: "eip155:84532" },
    signingMessage: expect.stringContaining("agentpaykit:release-v1"),
  });
  await expect(
    releaseCommand(["build", "--environment", "mainnet", "--body", bodyPath]),
  ).rejects.toMatchObject({ code: "RELEASE_ENVIRONMENT_MISMATCH" });
});
