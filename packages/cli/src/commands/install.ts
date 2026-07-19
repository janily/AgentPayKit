import { readFile } from "node:fs/promises";
import { homedir } from "node:os";

import { installSkill } from "@agentpaykit/installer";

export async function installCommand(args: string[]) {
  const packagePath = args[0];
  if (!packagePath) {
    throw Object.assign(new Error("PACKAGE_PATH_REQUIRED"), {
      code: "PACKAGE_PATH_REQUIRED",
    });
  }
  const executable = process.argv[1];
  if (!executable) {
    throw Object.assign(new Error("CLIENT_BINARY_MISSING"), {
      code: "CLIENT_BINARY_MISSING",
    });
  }
  const layout = await installSkill({
    home: process.env.AGENTPAYKIT_HOME ?? homedir(),
    packageBytes: await readFile(packagePath),
    clientBytes: await readFile(executable),
  });
  return {
    skillRoot: layout.skillRoot,
    client: layout.clientBin,
    agents: ["codex", "claude-code"],
  };
}
