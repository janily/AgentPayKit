import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installSkill } from "../../packages/installer/src/index";
import { expect, test } from "vitest";

import { securityPackageFixture } from "./helpers/package-fixture";

test("tampered package leaves the installation home untouched", async () => {
  const home = await mkdtemp(join(tmpdir(), "agentpay-tamper-home-"));
  const built = await securityPackageFixture();
  const tampered = Uint8Array.from(built.bytes);
  tampered[520] ^= 1;

  await expect(
    installSkill({
      home,
      packageBytes: tampered,
      clientBytes: new Uint8Array([1]),
      platform: "darwin",
      now: new Date("2026-07-20T00:00:00.000Z"),
    }),
  ).rejects.toThrow();
  expect(await readdir(home)).toEqual([]);
});
