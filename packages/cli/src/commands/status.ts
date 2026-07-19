import { record, required } from "./shared";

export async function statusCommand(
  args: string[],
  client: { status(id: string): Promise<unknown> },
) {
  const invocationId = required(args[0], "INVOCATION_ID_REQUIRED");
  const signed = record(
    await client.status(invocationId),
    "INVALID_STATUS_RESPONSE",
  );
  return record(signed.payload, "INVALID_STATUS_RESPONSE");
}
