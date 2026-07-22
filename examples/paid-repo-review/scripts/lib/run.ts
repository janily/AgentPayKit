import { spawn } from "node:child_process";

import type { RunCommand } from "./deploy.js";

export const runCommand: RunCommand = (argv, commandCwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: commandCwd,
      shell: false,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      const details = [stdout.trim(), stderr.trim()]
        .filter((value) => value !== "")
        .join("\n");
      reject(
        new Error(
          `COMMAND_FAILED (${code ?? "signal"}): ${argv.join(" ")}${details === "" ? "" : `\n${details}`}`,
        ),
      );
    });
  });
