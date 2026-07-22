import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  assertCleanBuild,
  resolvePnpmFromPath,
  resolveSpawnCommand,
  runCleanBuildCommand,
} from "../../scripts/assert-clean-build.mjs";

const execFileAsync = promisify(execFile);

interface CleanBuildCommand {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

const temporaryDirectories: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function minimalRepository(): Promise<string> {
  const root = await temporaryDirectory("agentpay-clean-source-");
  await writeFile(join(root, "package.json"), '{"scripts":{}}\n', "utf8");
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n",
    "utf8",
  );
  return root;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("assertCleanBuild", () => {
  test("runs the complete frozen verification contract in a fresh copy", async () => {
    const rootDir = await minimalRepository();
    const commands: CleanBuildCommand[] = [];

    const result = await assertCleanBuild({
      rootDir,
      resolvePnpm: async () => "/path/from/PATH/pnpm",
      runCommand: async (command) => {
        commands.push(command);
      },
    });

    expect(
      commands.map(({ executable, args }) => [executable, ...args]),
    ).toEqual([
      ["/path/from/PATH/pnpm", "install", "--frozen-lockfile"],
      ["/path/from/PATH/pnpm", "format:check"],
      ["/path/from/PATH/pnpm", "lint"],
      ["/path/from/PATH/pnpm", "typecheck"],
      ["/path/from/PATH/pnpm", "test"],
      ["/path/from/PATH/pnpm", "build"],
    ]);
    expect(new Set(commands.map(({ cwd }) => cwd))).toEqual(
      new Set([result.copyDir]),
    );
    expect(commands.every(({ env }) => env.AGENTPAY_CLEAN_COPY === "1")).toBe(
      true,
    );
    await expect(access(result.temporaryDirectory)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("rejects a checkout without a pnpm lockfile before making a copy", async () => {
    const rootDir = await temporaryDirectory("agentpay-no-lock-");
    await writeFile(join(rootDir, "package.json"), "{}\n", "utf8");

    await expect(
      assertCleanBuild({ rootDir, runCommand: vi.fn() }),
    ).rejects.toThrow("pnpm-lock.yaml");
  });

  test("resolves the pnpm executable from PATH without a version constraint", async () => {
    const bin = await temporaryDirectory("agentpay-pnpm-path-");
    const executable = join(
      bin,
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    );
    await writeFile(executable, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(executable, 0o755);

    await expect(resolvePnpmFromPath({ PATH: bin })).resolves.toBe(executable);
  });

  test("launches a Windows pnpm command shim through ComSpec without shell mode", () => {
    expect(
      resolveSpawnCommand(
        {
          executable: "C:\\Program Files\\pnpm\\pnpm.cmd",
          args: ["install", "--frozen-lockfile"],
          cwd: "C:\\repo",
          env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
          timeoutMs: 1_000,
        },
        "win32",
      ),
    ).toEqual({
      executable: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        '"C:\\Program Files\\pnpm\\pnpm.cmd" "install" "--frozen-lockfile"',
      ],
    });
  });

  test("uses the child marker to skip recursive clean-copy verification", async () => {
    const script = join(
      import.meta.dirname,
      "..",
      "..",
      "scripts",
      "assert-clean-build.mjs",
    );
    const { stdout } = await execFileAsync(process.execPath, [script], {
      env: { ...process.env, AGENTPAY_CLEAN_COPY: "1" },
    });

    expect(stdout).toContain("nested run skipped");
  });

  test("excludes dependencies, generated output, logs, git data and prior evidence", async () => {
    const rootDir = await minimalRepository();
    for (const path of [
      ["node_modules", "leak.js"],
      [".git", "config"],
      [".turbo", "state"],
      [".next", "server.js"],
      [".cache", "state"],
      [".storybook-static", "index.html"],
      [".vercel", "project.json"],
      [".yarn", "cache.zip"],
      ["dist", "index.js"],
      ["dist-worker", "worker.js"],
      ["build", "index.js"],
      ["out", "index.js"],
      ["coverage", "result.json"],
      ["logs", "application.txt"],
      ["tmp", "scratch.txt"],
      ["temp", "scratch.txt"],
      ["docker-volumes", "data"],
      ["docs", "acceptance", "evidence", "old.md"],
    ]) {
      await mkdir(join(rootDir, ...path.slice(0, -1)), { recursive: true });
      await writeFile(join(rootDir, ...path), "generated\n", "utf8");
    }
    await writeFile(join(rootDir, "debug.log"), "generated\n", "utf8");
    await writeFile(join(rootDir, ".env.local"), "SECRET=not-copied\n", "utf8");
    await writeFile(join(rootDir, "cache.tsbuildinfo"), "generated\n", "utf8");
    await writeFile(join(rootDir, "next-env.d.ts"), "generated\n", "utf8");
    await writeFile(join(rootDir, "package.tgz"), "generated\n", "utf8");
    await writeFile(join(rootDir, "coverage.lcov"), "generated\n", "utf8");
    await writeFile(join(rootDir, "scratch.tmp"), "generated\n", "utf8");
    await writeFile(join(rootDir, ".pnp.js"), "generated\n", "utf8");
    await writeFile(join(rootDir, ".env.example"), "SAFE=example\n", "utf8");

    let copiedRoot = "";
    await assertCleanBuild({
      rootDir,
      resolvePnpm: async () => "pnpm",
      runCommand: async ({ cwd }) => {
        copiedRoot = cwd;
        await expect(
          readFile(join(cwd, "package.json"), "utf8"),
        ).resolves.toContain("scripts");
        for (const excluded of [
          "node_modules/leak.js",
          ".git/config",
          ".turbo/state",
          ".next/server.js",
          ".cache/state",
          ".storybook-static/index.html",
          ".vercel/project.json",
          ".yarn/cache.zip",
          "dist/index.js",
          "dist-worker/worker.js",
          "build/index.js",
          "out/index.js",
          "coverage/result.json",
          "logs/application.txt",
          "tmp/scratch.txt",
          "temp/scratch.txt",
          "docker-volumes/data",
          "docs/acceptance/evidence/old.md",
          "debug.log",
          ".env.local",
          "cache.tsbuildinfo",
          "next-env.d.ts",
          "package.tgz",
          "coverage.lcov",
          "scratch.tmp",
          ".pnp.js",
        ]) {
          await expect(access(join(cwd, excluded))).rejects.toMatchObject({
            code: "ENOENT",
          });
        }
        await expect(readFile(join(cwd, ".env.example"), "utf8")).resolves.toBe(
          "SAFE=example\n",
        );
      },
    });
    expect(copiedRoot).not.toBe(rootDir);
  });

  test("excludes a worktree gitfile without exposing its original path", async () => {
    const rootDir = await minimalRepository();
    const originalPath = "/sensitive/original/repository/.git/worktrees/copy";
    await writeFile(join(rootDir, ".git"), `gitdir: ${originalPath}\n`, "utf8");

    await assertCleanBuild({
      rootDir,
      resolvePnpm: async () => "pnpm",
      runCommand: async ({ cwd }) => {
        await expect(access(join(cwd, ".git"))).rejects.toMatchObject({
          code: "ENOENT",
        });
      },
    });
  });

  test("cannot resolve an undeclared dependency present only in the original", async () => {
    const rootDir = await minimalRepository();
    await writeFile(
      join(rootDir, "package.json"),
      `${JSON.stringify({
        scripts: {
          "format:check": `${process.execPath} -e ""`,
          lint: `${process.execPath} -e ""`,
          typecheck: `${process.execPath} -e ""`,
          test: `${process.execPath} probe.mjs`,
          build: `${process.execPath} -e ""`,
        },
      })}\n`,
      "utf8",
    );
    await writeFile(
      join(rootDir, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\nimporters:\n  .: {}\n",
      "utf8",
    );
    await mkdir(join(rootDir, "node_modules", "undeclared-clean-build-probe"), {
      recursive: true,
    });
    await writeFile(
      join(
        rootDir,
        "node_modules",
        "undeclared-clean-build-probe",
        "package.json",
      ),
      '{"name":"undeclared-clean-build-probe","type":"module","exports":"./index.js"}\n',
      "utf8",
    );
    await writeFile(
      join(rootDir, "node_modules", "undeclared-clean-build-probe", "index.js"),
      "export default true;\n",
      "utf8",
    );
    await writeFile(
      join(rootDir, "probe.mjs"),
      'import "undeclared-clean-build-probe";\n',
      "utf8",
    );

    await import(join(rootDir, "probe.mjs"));

    await expect(assertCleanBuild({ rootDir })).rejects.toThrow(
      "clean verification command failed: pnpm test",
    );
  });

  test("rejects source symlinks and removes only its exact temporary directory", async () => {
    const rootDir = await minimalRepository();
    const outside = await temporaryDirectory("agentpay-outside-");
    const sentinel = join(outside, "sentinel.txt");
    await writeFile(sentinel, "keep\n", "utf8");
    const { symlink } = await import("node:fs/promises");
    await symlink(sentinel, join(rootDir, "escape"));

    await expect(assertCleanBuild({ rootDir })).rejects.toThrow("symlink");
    await expect(readFile(sentinel, "utf8")).resolves.toBe("keep\n");
  });

  test("reports a bounded child failure without leaking child environment", async () => {
    const rootDir = await minimalRepository();

    let message = "";
    try {
      await assertCleanBuild({
        rootDir,
        resolvePnpm: async () => "pnpm",
        runCommand: async ({ args }) => {
          throw new Error(
            `command failed: pnpm ${args.join(" ")}; SECRET=value`,
          );
        },
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain(
      "clean verification command failed: pnpm install --frozen-lockfile",
    );
    expect(message).not.toContain("SECRET=value");
  });

  test("terminates a subprocess that exceeds its bound", async () => {
    const started = Date.now();
    await expect(
      runCleanBuildCommand({
        executable: process.execPath,
        args: ["-e", "setInterval(() => {}, 1000)"],
        cwd: tmpdir(),
        env: { PATH: process.env.PATH },
        timeoutMs: 20,
      }),
    ).rejects.toThrow("timed out");
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  test("retains the exit status while omitting child output from the stage error", async () => {
    let message = "";
    try {
      await runCleanBuildCommand({
        executable: process.execPath,
        args: ["-e", 'process.stderr.write("SECRET=value"); process.exit(7)'],
        cwd: tmpdir(),
        env: { PATH: process.env.PATH },
        timeoutMs: 1_000,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("command exited 7");
    expect(message).not.toContain("SECRET=value");
  });

  test.runIf(process.platform !== "win32")(
    "terminates descendants when a bounded subprocess times out",
    async () => {
      const directory = await temporaryDirectory("agentpay-timeout-tree-");
      const sentinel = join(directory, "descendant-survived");
      const descendant = `process.on("SIGTERM", () => {}); setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(sentinel)}, "bad"), 250); setInterval(() => {}, 1000)`;
      const parent = `process.on("SIGTERM", () => process.exit(0)); require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], { stdio: "ignore" }); setInterval(() => {}, 1000)`;

      await expect(
        runCleanBuildCommand({
          executable: process.execPath,
          args: ["-e", parent],
          cwd: directory,
          env: { PATH: process.env.PATH },
          timeoutMs: 40,
        }),
      ).rejects.toThrow("timed out");
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 350));
      await expect(access(sentinel)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );
});
