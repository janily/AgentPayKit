import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installSkill } from "../../packages/installer/src/index";
import { expect, test } from "vitest";

import { securityPackageFixture } from "./helpers/package-fixture";

test.each([
  {
    name: "modified archive content",
    tamper(bytes: Uint8Array) {
      const tampered = Uint8Array.from(bytes);
      tampered[520] ^= 1;
      return tampered;
    },
  },
  {
    name: "content appended after the canonical archive terminator",
    tamper(bytes: Uint8Array) {
      const tampered = new Uint8Array(bytes.length + 512);
      tampered.set(bytes);
      tampered.set(
        new TextEncoder().encode("unsigned trailing content"),
        bytes.length,
      );
      return tampered;
    },
  },
])("$name leaves the installation home untouched", async ({ tamper }) => {
  const home = await mkdtemp(join(tmpdir(), "agentpay-tamper-home-"));
  const built = await securityPackageFixture();

  await expect(
    installSkill({
      home,
      packageBytes: tamper(built.bytes),
      clientBytes: new Uint8Array([1]),
      platform: "darwin",
      now: new Date("2026-07-20T00:00:00.000Z"),
    }),
  ).rejects.toThrow();
  expect(await readdir(home)).toEqual([]);
});
