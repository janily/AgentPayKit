import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("package contents", () => {
  it("packs the template source and an executable rebuilt CLI", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "agentpaykit-pack-"));
    await rm(join(packageDirectory, "dist"), { recursive: true, force: true });

    await execFileAsync(
      "npm",
      ["pack", "--json", "--pack-destination", outputDirectory],
      {
        cwd: packageDirectory,
        env: {
          ...process.env,
          HOME: outputDirectory,
          NPM_CONFIG_CACHE: join(outputDirectory, "npm-cache"),
          npm_config_cache: join(outputDirectory, "npm-cache"),
        },
      },
    );

    const [tarball] = await readdir(outputDirectory);
    const archive = join(outputDirectory, tarball);
    const { stdout } = await execFileAsync("tar", ["-tvzf", archive]);

    expect(stdout).toContain("package/template/_gitignore");
    expect(stdout).toMatch(/-rwx\S* .*package\/dist\/cli\.js$/m);
  });
});
