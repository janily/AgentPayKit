import type { InstalledSkill } from "@agentpaykit/client";

import { option, record, required } from "./shared";

export interface InvokePorts {
  client: {
    invoke(skill: InstalledSkill, input: unknown): Promise<unknown>;
  };
  loadSkill(path: string): Promise<InstalledSkill>;
}

export async function invokeCommand(args: string[], ports: InvokePorts) {
  const skillPath = required(option(args, "--skill"), "SKILL_PATH_REQUIRED");
  const inputJson = required(option(args, "--input"), "INPUT_REQUIRED");
  let input: unknown;
  try {
    input = JSON.parse(inputJson) as unknown;
  } catch {
    throw Object.assign(new Error("INVALID_INPUT_JSON"), {
      code: "INVALID_INPUT_JSON",
    });
  }
  let skill: InstalledSkill;
  try {
    skill = await ports.loadSkill(skillPath);
  } catch (error) {
    throw Object.assign(
      error instanceof Error ? error : new Error("SKILL_LOAD_FAILED"),
      {
        code:
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : "SKILL_LOAD_FAILED",
        chargeState: "NOT_CHARGED",
      },
    );
  }
  const handle = record(
    await ports.client.invoke(skill, input),
    "INVALID_INVOCATION_HANDLE",
  );
  const signedStatus = record(handle.status, "INVALID_INVOCATION_HANDLE");
  const status = record(signedStatus.payload, "INVALID_INVOCATION_HANDLE");
  const invocationId = required(
    typeof handle.invocationId === "string" ? handle.invocationId : undefined,
    "INVALID_INVOCATION_HANDLE",
  );
  return {
    invocationId,
    status: status.status,
    chargeState: status.chargeState,
    resumeCommand: `agentpay resume ${invocationId}`,
  };
}
