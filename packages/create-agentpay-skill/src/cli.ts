#!/usr/bin/env node

import { resolve } from "node:path";

import { scaffold } from "./scaffold.js";

export async function run(argv: string[]): Promise<void> {
  const [projectName, ...options] = argv;
  const cwd = parseCwd(options);

  if (projectName === undefined || projectName.startsWith("-")) {
    throw new Error(
      "USAGE: create-agentpay-skill <project-name> [--cwd <directory>]",
    );
  }

  const result = await scaffold({ cwd, projectName });
  process.stdout.write(`Created ${result.directory}\n`);
}

function parseCwd(options: string[]): string {
  if (options.length === 0) {
    return process.cwd();
  }

  if (options.length === 2 && options[0] === "--cwd") {
    return resolve(options[1]);
  }

  throw new Error(
    "USAGE: create-agentpay-skill <project-name> [--cwd <directory>]",
  );
}

void run(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
