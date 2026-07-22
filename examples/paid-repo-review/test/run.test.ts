import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

import { runCommand } from "../scripts/lib/run.js";

it("includes captured stdout when an argv command fails", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "agentpaykit-command-"));

  await expect(
    runCommand(
      [
        process.execPath,
        "-e",
        'process.stdout.write("diagnostic output"); process.exit(2)',
      ],
      cwd,
    ),
  ).rejects.toThrow("diagnostic output");
});
