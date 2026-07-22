import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

describe("published server package", () => {
  test("builds, packs only production files, and imports offline", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentpay-server-pack-"));
    const packDirectory = join(root, "pack");
    const installDirectory = join(root, "install");
    const environment = { ...process.env, CI: "true" };
    execFileSync("pnpm", ["pack", "--pack-destination", packDirectory], {
      cwd: packageRoot,
      env: environment,
      stdio: "pipe",
    });
    const tarballs = (await readdir(packDirectory)).filter((name) =>
      name.endsWith(".tgz"),
    );
    expect(tarballs).toHaveLength(1);
    const tarball = join(packDirectory, tarballs[0]!);
    const entries = execFileSync("tar", ["-tzf", tarball], {
      encoding: "utf8",
    })
      .trim()
      .split("\n");

    expect(entries).toContain("package/package.json");
    expect(entries).toContain("package/README.md");
    expect(entries).toContain("package/LICENSE");
    expect(entries).toContain("package/dist/index.js");
    expect(entries).toContain("package/dist/index.d.ts");
    expect(entries).toContain("package/dist/next.js");
    expect(entries).toContain("package/dist/next.d.ts");
    expect(
      entries.every(
        (entry) =>
          entry === "package/package.json" ||
          entry === "package/README.md" ||
          entry === "package/LICENSE" ||
          entry.startsWith("package/dist/"),
      ),
    ).toBe(true);

    await mkdir(installDirectory, { recursive: true });
    execFileSync("tar", ["-xzf", tarball, "-C", installDirectory]);
    const entrypoint = pathToFileURL(
      join(installDirectory, "package", "dist", "index.js"),
    ).href;
    const smoke = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import(${JSON.stringify(entrypoint)}).then(m => { if (typeof m.definePaidSkill !== 'function') process.exit(1) })`,
      ],
      { cwd: installDirectory, env: environment, encoding: "utf8" },
    );
    expect(smoke.status).toBe(0);
    expect(smoke.stderr).toBe("");
  }, 60_000);
});
