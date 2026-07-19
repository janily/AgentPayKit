import { scaffoldPaidSkill } from "@agentpaykit/publisher";

export async function createCommand(args: string[]): Promise<{ path: string }> {
  const name = args[0];
  if (!name)
    throw Object.assign(new Error("SKILL_NAME_REQUIRED"), {
      code: "SKILL_NAME_REQUIRED",
    });
  return { path: await scaffoldPaidSkill({ name, directory: process.cwd() }) };
}
