export async function payInsightCommand(
  args: string[],
  read: (filter: { releaseId?: string; status?: string }) => Promise<unknown>,
) {
  const releaseIndex = args.indexOf("--release");
  const statusIndex = args.indexOf("--status");
  return read({
    ...(releaseIndex >= 0 ? { releaseId: args[releaseIndex + 1] } : {}),
    ...(statusIndex >= 0 ? { status: args[statusIndex + 1] } : {}),
  });
}
