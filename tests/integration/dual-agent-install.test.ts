import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join } from "node:path";

import { installSkill } from "../../packages/installer/src/index";
import { expect, test } from "vitest";

import { securityPackageFixture } from "../security/helpers/package-fixture";

const execute = promisify(execFile);

test("one install gives Codex and Claude Code the same client and fake Runtime", async () => {
  const home = await mkdtemp(join(tmpdir(), "agentpay-dual-home-"));
  const built = await securityPackageFixture();
  const client = new TextEncoder().encode(
    '#!/bin/sh\nprintf "%s:%s\\n" "$AGENTPAY_FAKE_RUNTIME" "$1"\n',
  );
  const layout = await installSkill({
    home,
    packageBytes: built.bytes,
    clientBytes: client,
    platform: "darwin",
    now: new Date("2026-07-20T00:00:00.000Z"),
  });

  const invokeAdapter = async (adapter: string, agent: string) => {
    const instructions = await readFile(adapter, "utf8");
    expect(instructions).toContain(layout.clientBin);
    return execute(layout.clientBin, [agent], {
      env: { ...process.env, AGENTPAY_FAKE_RUNTIME: "runtime://fixture" },
    });
  };
  const [codex, claude] = await Promise.all([
    invokeAdapter(layout.codexEntry, "codex"),
    invokeAdapter(layout.claudeEntry, "claude-code"),
  ]);
  expect(codex.stdout.trim()).toBe("runtime://fixture:codex");
  expect(claude.stdout.trim()).toBe("runtime://fixture:claude-code");
  expect((await stat(layout.codexEntry)).ino).toBe(
    (await stat(layout.claudeEntry)).ino,
  );
  expect((await stat(layout.clientBin)).mode & 0o111).not.toBe(0);
});
