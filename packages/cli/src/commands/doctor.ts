import { homedir } from "node:os";

import { doctorInstall, installLayout } from "@agentpaykit/installer";

export async function doctorCommand(args: string[]) {
  const [name, releaseId] = args;
  if (!name || !releaseId) {
    throw Object.assign(new Error("DOCTOR_TARGET_REQUIRED"), {
      code: "DOCTOR_TARGET_REQUIRED",
    });
  }
  await doctorInstall(
    installLayout(process.env.AGENTPAYKIT_HOME ?? homedir(), name, releaseId),
  );
  return { healthy: true, name, releaseId };
}
