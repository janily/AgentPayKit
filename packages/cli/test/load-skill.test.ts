import { writeFile } from "node:fs/promises";

import { StrictReleaseVerifier } from "@agentpaykit/client";
import { expect, test } from "vitest";

import { securityPackageFixture } from "../../../tests/security/helpers/package-fixture";
import { loadSkill } from "../src/default-dependencies";

test("loads and verifies an installed apkg without a sidecar descriptor", async () => {
  const built = await securityPackageFixture();
  const path = `${process.env.TMPDIR ?? "/tmp"}/agentpay-load-${process.pid}.apkg`;
  await writeFile(path, built.bytes, { mode: 0o600 });
  const skill = await loadSkill(path);

  await expect(
    new StrictReleaseVerifier().verify(skill),
  ).resolves.toMatchObject({
    releaseId: built.releaseId,
    runtime: { url: "https://runtime.example.test" },
  });
});
