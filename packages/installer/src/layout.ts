import { join } from "node:path";

export function installLayout(home: string, name: string, releaseId: string) {
  const sharedRoot = join(home, ".agentpaykit");
  const skillRoot = join(sharedRoot, "skills", name, releaseId);
  return {
    sharedRoot,
    clientRoot: join(sharedRoot, "client", "0.1.0"),
    clientBin: join(sharedRoot, "client", "0.1.0", "agentpay"),
    skillRoot,
    packageFile: join(skillRoot, "package.apkg"),
    currentEntry: join(sharedRoot, "skills", name, "current.md"),
    codexEntry: join(home, ".codex", "skills", name, "SKILL.md"),
    claudeEntry: join(home, ".claude", "skills", name, "SKILL.md"),
  };
}
