import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installSkill } from "../../packages/installer/src/index";
import { expect, test } from "vitest";

import { securityPackageFixture } from "./helpers/package-fixture";

test("release conflict preserves the existing installation", async () => {
  const home = await mkdtemp(join(tmpdir(), "agentpay-conflict-home-"));
  const built = await securityPackageFixture();
  const layout = await installSkill({
    home,
    packageBytes: built.bytes,
    clientBytes: new TextEncoder().encode("#!/bin/sh\nexit 0\n"),
    platform: "darwin",
    now: new Date("2026-07-20T00:00:00.000Z"),
  });
  const conflict = Buffer.from("user-owned-conflict");
  await writeFile(layout.packageFile, conflict);
  const before = (await readdir(home, { recursive: true })).sort();

  await expect(
    installSkill({
      home,
      packageBytes: built.bytes,
      platform: "darwin",
      now: new Date("2026-07-20T00:00:00.000Z"),
    }),
  ).rejects.toMatchObject({ code: "SKILL_RELEASE_CONFLICT" });
  expect(await readFile(layout.packageFile)).toEqual(conflict);
  expect((await readdir(home, { recursive: true })).sort()).toEqual(before);
});
