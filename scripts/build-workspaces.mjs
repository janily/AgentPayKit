import { spawnSync } from "node:child_process";

const pnpmScript = process.env.npm_execpath;
const command = pnpmScript === undefined ? "pnpm" : process.execPath;
const args =
  pnpmScript === undefined
    ? ["-r", "run", "build"]
    : [pnpmScript, "-r", "run", "build"];
const result = spawnSync(command, args, {
  env: { ...process.env, AGENTPAY_ALLOW_TEST_RECEIVER: "1" },
  shell: false,
  stdio: "inherit",
});

if (result.error !== undefined) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
