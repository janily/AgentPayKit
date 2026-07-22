import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

describe("published CLI package", () => {
  test("packs only production files and runs the extracted artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentpay-cli-pack-"));
    const packDirectory = join(root, "pack");
    const installDirectory = join(root, "install");
    const environment = {
      ...process.env,
      CI: "true",
    };
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
    expect(
      entries.every(
        (entry) =>
          entry === "package/package.json" ||
          entry === "package/README.md" ||
          entry === "package/LICENSE" ||
          entry.startsWith("package/dist/"),
      ),
    ).toBe(true);
    expect(entries.join("\n")).not.toMatch(
      /src\/|test\/|tsbuildinfo|bridge-assets|commands\/invoke/,
    );

    await mkdir(installDirectory, { recursive: true });
    execFileSync("tar", ["-xzf", tarball, "-C", installDirectory]);
    const extractedPackage = join(installDirectory, "package");
    const installedManifest = JSON.parse(
      await readFile(join(extractedPackage, "package.json"), "utf8"),
    ) as { private?: boolean; dependencies?: Record<string, string> };
    expect(installedManifest.private).not.toBe(true);
    expect(installedManifest.dependencies).toEqual({
      "@agentpaykit/client-core": "0.1.0",
      "@metamask/connect-evm": "2.1.1",
      "@x402/core": "2.19.0",
      "@x402/evm": "2.19.0",
      "qrcode-terminal": "0.12.0",
      viem: "2.55.2",
    });

    await symlink(
      join(packageRoot, "node_modules"),
      join(extractedPackage, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const smoke = spawnSync(
      process.execPath,
      [join(extractedPackage, "dist", "index.js"), "invoke", "--json"],
      {
        cwd: extractedPackage,
        env: environment,
        encoding: "utf8",
      },
    );
    expect(smoke.status).toBe(2);
    expect(smoke.stdout).toBe("");
    expect(JSON.parse(smoke.stderr)).toEqual({
      ok: false,
      error: {
        code: "UNKNOWN_COMMAND",
        message: "UNKNOWN_COMMAND",
        paymentState: "not-charged",
      },
    });
  }, 60_000);
});
