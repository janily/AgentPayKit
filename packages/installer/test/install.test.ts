import { createPrivateKey, createPublicKey } from "node:crypto";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildRelease,
  buildSkillPackage,
  prepareSkillPackage,
  signRelease,
  signRuntimeDelegation,
} from "@agentpaykit/publisher";
import { describe, expect, test } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

import { installSkill, uninstallSkill } from "../src/index";

const seed = Uint8Array.from({ length: 32 }, (_, index) => 32 - index);
const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
const publicKey = createPublicKey(
  createPrivateKey({
    key: Buffer.concat([pkcs8Prefix, seed]),
    format: "der",
    type: "pkcs8",
  }),
)
  .export({ format: "der", type: "spki" })
  .subarray(-32)
  .toString("base64url");
const wallet = privateKeyToAccount(
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
);

async function packageFixture(issuedAt = "2026-07-19T00:00:00.000Z") {
  const project = await mkdtemp(join(tmpdir(), "agentpay-install-package-"));
  await writeFile(
    join(project, "agentpay.json"),
    JSON.stringify({
      schemaVersion: "1",
      name: "research-lite",
      files: ["handler.ts"],
    }),
  );
  await writeFile(join(project, "handler.ts"), "export default {};\n");
  const prepared = await prepareSkillPackage(project);
  const delegation = await signRuntimeDelegation(
    {
      schemaVersion: "1",
      environment: "testnet",
      network: "eip155:84532",
      runtimeUrl: "https://runtime.example.test",
      runtimeKeyId: "runtime-install",
      runtimePublicKey: publicKey,
      issuedAt,
      expiresAt: "2026-09-19T00:00:00.000Z",
    },
    { keyId: "runtime-install", privateKeySeed: seed },
  );
  const payload = await buildRelease({
    schemaVersion: "1",
    packageDigest: prepared.digest,
    environment: "testnet",
    network: "eip155:84532",
    publisher: "0x1111111111111111111111111111111111111111",
    payee: wallet.address,
    amount: "10000",
    asset: "0x2222222222222222222222222222222222222222",
    runtimeDelegation: delegation,
    issuedAt,
    expiresAt: "2026-09-19T00:00:00.000Z",
  });
  const release = await signRelease(payload, wallet);
  return {
    ...(await buildSkillPackage({ root: project, release })),
    releaseId: release.payload.releaseId,
  };
}

describe("atomic dual-agent installer", () => {
  test("installs once, reuses the client idempotently, and uninstalls only the skill", async () => {
    const home = await mkdtemp(join(tmpdir(), "agentpay-home-"));
    const built = await packageFixture();
    const first = await installSkill({
      home,
      packageBytes: built.bytes,
      clientBytes: new TextEncoder().encode("#!/bin/sh\n"),
      platform: "darwin",
      now: new Date("2026-07-20T00:00:00.000Z"),
    });
    const second = await installSkill({
      home,
      packageBytes: built.bytes,
      platform: "darwin",
      now: new Date("2026-07-20T00:00:00.000Z"),
    });

    expect(second.clientBin).toBe(first.clientBin);
    expect((await lstat(first.codexEntry)).isSymbolicLink()).toBe(true);
    expect(await readlink(first.codexEntry)).toBe(first.currentEntry);
    expect(await readlink(first.claudeEntry)).toBe(first.currentEntry);
    expect(await readFile(first.codexEntry, "utf8")).toContain(
      `--skill ${first.packageFile}`,
    );

    await uninstallSkill({
      home,
      name: "research-lite",
      releaseId: built.releaseId,
    });
    expect((await lstat(first.clientBin)).isFile()).toBe(true);
  });

  test("rejects tamper and missing client before writing installation roots", async () => {
    const built = await packageFixture();
    const missingHome = await mkdtemp(join(tmpdir(), "agentpay-home-"));
    await expect(
      installSkill({
        home: missingHome,
        packageBytes: built.bytes,
        platform: "darwin",
        now: new Date("2026-07-20T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "AGENTPAY_CLIENT_MISSING",
      remediation: "agentpay install-client",
    });
    expect(await readdir(missingHome)).toEqual([]);

    const tamperedHome = await mkdtemp(join(tmpdir(), "agentpay-home-"));
    const tampered = Uint8Array.from(built.bytes);
    tampered[520] ^= 1;
    await expect(
      installSkill({
        home: tamperedHome,
        packageBytes: tampered,
        clientBytes: new Uint8Array([1]),
        platform: "darwin",
        now: new Date("2026-07-20T00:00:00.000Z"),
      }),
    ).rejects.toThrow();
    expect(await readdir(tamperedHome)).toEqual([]);
  });

  test("upgrades the active release while reusing the shared client", async () => {
    const home = await mkdtemp(join(tmpdir(), "agentpay-home-"));
    const firstPackage = await packageFixture();
    const first = await installSkill({
      home,
      packageBytes: firstPackage.bytes,
      clientBytes: new Uint8Array([1]),
      platform: "darwin",
      now: new Date("2026-07-20T00:00:00.000Z"),
    });
    const upgradedPackage = await packageFixture("2026-07-21T00:00:00.000Z");
    const upgraded = await installSkill({
      home,
      packageBytes: upgradedPackage.bytes,
      platform: "darwin",
      now: new Date("2026-07-22T00:00:00.000Z"),
    });

    expect(upgraded.clientBin).toBe(first.clientBin);
    expect(upgraded.skillRoot).not.toBe(first.skillRoot);
    expect(await readlink(upgraded.currentEntry)).toBe(
      `${upgraded.skillRoot}/SKILL.md`,
    );
    expect((await lstat(first.packageFile)).isFile()).toBe(true);
  });

  test("rolls back injected write failure and preserves a user conflict", async () => {
    const built = await packageFixture();
    const failedHome = await mkdtemp(join(tmpdir(), "agentpay-home-"));
    await expect(
      installSkill({
        home: failedHome,
        packageBytes: built.bytes,
        clientBytes: new Uint8Array([1]),
        platform: "darwin",
        now: new Date("2026-07-20T00:00:00.000Z"),
        failAt: "codex",
      }),
    ).rejects.toThrow("INJECTED_WRITE_FAILURE");
    expect(await readdir(failedHome)).toEqual([]);

    const conflictHome = await mkdtemp(join(tmpdir(), "agentpay-home-"));
    const userEntry = join(
      conflictHome,
      ".codex",
      "skills",
      "research-lite",
      "SKILL.md",
    );
    await mkdir(join(conflictHome, ".codex", "skills", "research-lite"), {
      recursive: true,
    });
    await writeFile(userEntry, "user-owned");
    await expect(
      installSkill({
        home: conflictHome,
        packageBytes: built.bytes,
        clientBytes: new Uint8Array([1]),
        platform: "darwin",
        now: new Date("2026-07-20T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "AGENT_ENTRY_CONFLICT" });
    expect(await readFile(userEntry, "utf8")).toBe("user-owned");
  });
});
