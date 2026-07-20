import { lstat, mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { installLayout } from "@agentpaykit/installer";
import { describe, expect, test } from "vitest";

import { uninstallCommand } from "../src/commands/uninstall";

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

describe("uninstall command", () => {
  test("removes both agent entries and the skill but preserves shared client", async () => {
    const home = await mkdtemp(join(tmpdir(), "agentpay-cli-uninstall-"));
    const releaseId = `rel_${"a".repeat(64)}`;
    const layout = installLayout(home, "research-lite", releaseId);
    for (const path of [
      layout.clientBin,
      layout.packageFile,
      layout.currentEntry,
      layout.codexEntry,
      layout.claudeEntry,
    ]) {
      await mkdir(dirname(path), { recursive: true });
    }
    await writeFile(layout.clientBin, "client");
    await writeFile(layout.packageFile, "package");
    await writeFile(join(layout.skillRoot, "SKILL.md"), "adapter");
    await symlink(join(layout.skillRoot, "SKILL.md"), layout.currentEntry);
    await symlink(layout.currentEntry, layout.codexEntry);
    await symlink(layout.currentEntry, layout.claudeEntry);

    await expect(
      uninstallCommand(["research-lite", releaseId], home),
    ).resolves.toEqual({
      removed: true,
      name: "research-lite",
      releaseId,
      clientPreserved: layout.clientBin,
    });
    expect(await exists(layout.skillRoot)).toBe(false);
    expect(await exists(layout.codexEntry)).toBe(false);
    expect(await exists(layout.claudeEntry)).toBe(false);
    expect(await exists(layout.clientBin)).toBe(true);
  });
});
