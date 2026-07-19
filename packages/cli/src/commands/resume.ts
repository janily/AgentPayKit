import { required } from "./shared";

export async function resumeCommand(
  args: string[],
  client: { resume(id: string): Promise<unknown> },
) {
  return client.resume(required(args[0], "INVOCATION_ID_REQUIRED"));
}
