import { lstat } from "node:fs/promises";
import { homedir } from "node:os";

import { uninstallSkill } from "@agentpaykit/installer";
import { parseReleaseId } from "@agentpaykit/protocol";

import { required } from "./shared";

export async function uninstallCommand(
  args: string[],
  home = process.env.AGENTPAYKIT_HOME ?? homedir(),
) {
  const name = required(args[0], "SKILL_NAME_REQUIRED");
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(name)) {
    throw Object.assign(new Error("INVALID_SKILL_NAME"), {
      code: "INVALID_SKILL_NAME",
    });
  }
  const releaseId = parseReleaseId(required(args[1], "RELEASE_ID_REQUIRED"));
  const skillRoot = `${home}/.agentpaykit/skills/${name}/${releaseId}`;
  const removed = await lstat(skillRoot).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
  await uninstallSkill({ home, name, releaseId });
  return {
    removed,
    name,
    releaseId,
    clientPreserved: `${home}/.agentpaykit/client/0.1.0/agentpay`,
  };
}
