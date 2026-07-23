import { execFile, execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
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

    expect(stdout).toContain("package/README.md");
    expect(stdout).toContain("package/LICENSE");
    expect(stdout).toContain("package/template/_gitignore");
    expect(stdout).toMatch(/-rwx\S* .*package\/dist\/cli\.js$/m);

    const installDirectory = await mkdtemp(
      join(tmpdir(), "agentpaykit-install-"),
    );
    await mkdir(join(installDirectory, "node_modules"), { recursive: true });
    execFileSync("tar", ["-xzf", archive, "-C", installDirectory]);
    const extractedPackage = join(installDirectory, "package");
    await symlink(
      join(packageDirectory, "node_modules"),
      join(extractedPackage, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const smoke = await execFileAsync(
      process.execPath,
      [
        join(extractedPackage, "dist", "cli.js"),
        "demo-skill",
        "--cwd",
        installDirectory,
      ],
      {
        cwd: installDirectory,
        env: environment(),
        encoding: "utf8",
      },
    );
    expect(smoke.stdout).toContain("Created");
    const createdPackage = JSON.parse(
      await readFile(
        join(installDirectory, "demo-skill", "package.json"),
        "utf8",
      ),
    ) as { name: string; dependencies?: Record<string, string> };
    expect(createdPackage.name).toBe("demo-skill");
    expect(createdPackage.dependencies?.["@agentpaykit/server"]).toBe(
      "0.1.0-alpha.1",
    );
  });
});

function environment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: process.env.HOME ?? tmpdir(),
    NPM_CONFIG_CACHE: join(tmpdir(), "npm-cache"),
    npm_config_cache: join(tmpdir(), "npm-cache"),
  };
}
