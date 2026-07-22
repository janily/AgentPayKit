import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  delimiter,
  dirname,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const marker = "AGENTPAY_CLEAN_COPY";
const defaultTimeoutMs = 10 * 60 * 1000;
const maxOutputBytes = 1024 * 1024;

const excludedDirectoryNames = new Set([
  ".git",
  ".cache",
  ".idea",
  ".next",
  ".nyc_output",
  ".pnpm-store",
  ".storybook-static",
  ".superpowers",
  ".turbo",
  ".vercel",
  ".vscode",
  ".yarn",
  "docker-volumes",
  "dist-worker",
  "logs",
  "out",
  "temp",
  "tmp",
  "coverage",
  "dist",
  "build",
  "node_modules",
]);

const verificationSteps = [
  ["install", "--frozen-lockfile"],
  ["format:check"],
  ["lint"],
  ["typecheck"],
  ["test"],
  ["build"],
];

class CleanCommandError extends Error {
  constructor(message, { exitCode, signal, timedOut = false } = {}) {
    super(message);
    this.exitCode = exitCode;
    this.signal = signal;
    this.timedOut = timedOut;
  }
}

/**
 * @typedef {object} CleanBuildCommand
 * @property {string} executable
 * @property {string[]} args
 * @property {string} cwd
 * @property {NodeJS.ProcessEnv} env
 * @property {number} timeoutMs
 */

function isExcluded(relativePath, name, directory) {
  if (name === ".git") return true;
  if (directory && excludedDirectoryNames.has(name)) return true;
  const portablePath = relativePath.replaceAll("\\", "/");
  if (portablePath === "docs/acceptance/evidence") return true;
  if (name.startsWith(".env") && name !== ".env.example") return true;
  if (name === ".pnp" || name === ".pnp.js") return true;
  if (name === ".DS_Store" || name === "Thumbs.db") return true;
  if (name === "next-env.d.ts" || name.endsWith(".tsbuildinfo")) return true;
  if (name.endsWith(".tgz")) return true;
  if (name.endsWith(".lcov") || name.endsWith(".tmp")) return true;
  if (name.endsWith(".swp") || name.endsWith(".swo") || name.endsWith("~"))
    return true;
  return /(?:^|\.)log(?:\.\d+)?$/i.test(name);
}

async function copyEntry(sourceRoot, destinationRoot, relativePath = "") {
  const source = relativePath ? join(sourceRoot, relativePath) : sourceRoot;
  const destination = relativePath
    ? join(destinationRoot, relativePath)
    : destinationRoot;
  const sourceStat = await lstat(source);

  if (sourceStat.isSymbolicLink()) {
    throw new Error(
      `clean-copy source contains a symlink: ${relativePath || "."}`,
    );
  }

  if (sourceStat.isDirectory()) {
    await mkdir(destination, { recursive: true, mode: sourceStat.mode });
    for (const entry of await readdir(source, { withFileTypes: true })) {
      const childRelative = relativePath
        ? join(relativePath, entry.name)
        : entry.name;
      if (isExcluded(childRelative, entry.name, entry.isDirectory())) continue;
      const destinationRelative = relative(
        destinationRoot,
        join(destinationRoot, childRelative),
      );
      if (
        destinationRelative.startsWith("..") ||
        resolve(destinationRoot, childRelative) === resolve(destinationRoot)
      ) {
        throw new Error(
          `clean-copy path escapes destination: ${childRelative}`,
        );
      }
      await copyEntry(sourceRoot, destinationRoot, childRelative);
    }
    return;
  }

  if (!sourceStat.isFile()) {
    throw new Error(
      `clean-copy source contains an unsupported entry: ${relativePath}`,
    );
  }
  await copyFile(source, destination);
  await chmod(destination, sourceStat.mode);
}

async function assertNoSymlinks(directory, root = directory) {
  for (const entry of await readdir(directory)) {
    const path = join(directory, entry);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `clean-copy destination contains a symlink: ${relative(root, path)}`,
      );
    }
    if (stat.isDirectory()) await assertNoSymlinks(path, root);
  }
}

export async function resolvePnpmFromPath(env = process.env) {
  for (const directory of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(
      directory,
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    );
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }
  throw new Error("pnpm was not found on PATH");
}

function quoteWindowsCommandArgument(value) {
  return `"${value.replaceAll("%", "%%").replaceAll('"', '""')}"`;
}

export function resolveSpawnCommand(command, platform = process.platform) {
  if (platform === "win32" && /\.(?:cmd|bat)$/i.test(command.executable)) {
    return {
      executable: command.env.ComSpec ?? command.env.COMSPEC ?? "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        [command.executable, ...command.args]
          .map(quoteWindowsCommandArgument)
          .join(" "),
      ],
    };
  }
  return { executable: command.executable, args: command.args };
}

async function terminateWindowsProcessTree(child) {
  if (child.pid === undefined) {
    child.kill("SIGKILL");
    return;
  }
  await new Promise((resolvePromise) => {
    const killer = spawn(
      "taskkill.exe",
      ["/PID", String(child.pid), "/T", "/F"],
      { shell: false, stdio: "ignore" },
    );
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill("SIGKILL");
      resolvePromise();
    };
    const timeout = setTimeout(() => {
      killer.kill("SIGKILL");
      finish();
    }, 5_000);
    timeout.unref();
    killer.once("error", finish);
    killer.once("close", finish);
  });
}

async function terminateProcessTree(child) {
  if (process.platform === "win32") {
    await terminateWindowsProcessTree(child);
    return;
  }
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // The group may already have exited; try the direct child.
    }
  }
  child.kill("SIGKILL");
}

/** @param {CleanBuildCommand} command */
export async function runCleanBuildCommand(command) {
  await new Promise((resolvePromise, rejectPromise) => {
    const spawnCommand = resolveSpawnCommand(command);
    const child = spawn(spawnCommand.executable, spawnCommand.args, {
      cwd: command.cwd,
      detached: process.platform !== "win32",
      env: command.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let outputBytes = 0;
    let output = "";
    const append = (chunk) => {
      if (outputBytes >= maxOutputBytes) return;
      const remaining = maxOutputBytes - outputBytes;
      const buffer = Buffer.from(chunk).subarray(0, remaining);
      output += buffer.toString("utf8");
      outputBytes += buffer.byteLength;
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    let timedOut = false;
    let settled = false;
    let terminationPromise;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      terminationPromise = terminateProcessTree(child);
    }, command.timeoutMs);
    timeout.unref();
    child.once("error", (error) => {
      finish(rejectPromise, error);
    });
    child.once("close", async (code, signal) => {
      if (timedOut) {
        await terminationPromise;
        finish(
          rejectPromise,
          new CleanCommandError("command timed out", {
            signal,
            timedOut: true,
          }),
        );
      } else if (code === 0) {
        if (output) process.stdout.write(output);
        finish(resolvePromise, undefined);
      } else {
        finish(
          rejectPromise,
          new CleanCommandError(
            `command exited ${code ?? `after signal ${signal ?? "unknown"}`}`,
            { exitCode: code, signal },
          ),
        );
      }
    });
  });
}

export async function assertCleanBuild({
  rootDir = resolve(scriptDirectory, ".."),
  temporaryParent = tmpdir(),
  resolvePnpm = resolvePnpmFromPath,
  runCommand = runCleanBuildCommand,
  timeoutMs = defaultTimeoutMs,
} = {}) {
  const sourceRoot = await realpath(rootDir);
  await access(join(sourceRoot, "pnpm-lock.yaml"), constants.F_OK).catch(() => {
    throw new Error("pnpm-lock.yaml is required for a reproducible build");
  });

  const temporaryDirectory = await mkdtemp(
    join(temporaryParent, "agentpay-clean-build-"),
  );
  const copyDir = join(temporaryDirectory, "repository");
  try {
    await copyEntry(sourceRoot, copyDir);
    await assertNoSymlinks(copyDir);
    const pnpm = await resolvePnpm(process.env);
    const env = {
      ...process.env,
      [marker]: "1",
    };
    delete env.NODE_PATH;
    for (const args of verificationSteps) {
      /** @type {CleanBuildCommand} */
      const command = {
        executable: pnpm,
        args,
        cwd: copyDir,
        env,
        timeoutMs,
      };
      try {
        await runCommand(command);
      } catch (error) {
        const outcome =
          error instanceof CleanCommandError && error.timedOut
            ? " (timed out)"
            : error instanceof CleanCommandError && error.exitCode !== undefined
              ? ` (exit ${error.exitCode ?? `signal ${error.signal ?? "unknown"}`})`
              : " (could not start)";
        throw new Error(
          `clean verification command failed: ${basename(pnpm)} ${args.join(" ")}${outcome}`,
        );
      }
    }
    return { temporaryDirectory, copyDir };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.env[marker] === "1") {
    console.log("Clean-copy verification already active; nested run skipped.");
  } else {
    assertCleanBuild().catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  }
}
