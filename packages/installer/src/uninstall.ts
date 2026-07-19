import { readlink, rm } from "node:fs/promises";

import { installLayout } from "./layout";

export async function uninstallSkill(input: {
  home: string;
  name: string;
  releaseId: string;
}): Promise<void> {
  const layout = installLayout(input.home, input.name, input.releaseId);
  let active = false;
  try {
    active = (await readlink(layout.currentEntry)).startsWith(layout.skillRoot);
  } catch {
    active = false;
  }
  await rm(layout.skillRoot, { recursive: true, force: true });
  if (active) {
    await rm(layout.currentEntry, { force: true });
    await rm(layout.codexEntry, { force: true });
    await rm(layout.claudeEntry, { force: true });
  }
}
