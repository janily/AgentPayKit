import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { renderSkillMarkdown } from "@agentpaykit/server";

import skill from "../agentpay.skill";

const origin = readOrigin(process.argv.slice(2));
const skillDirectory = join(process.cwd(), "skill");
await mkdir(skillDirectory, { recursive: true });
await writeFile(
  join(skillDirectory, "SKILL.md"),
  renderSkillMarkdown(skill, { origin }),
);

function readOrigin(argv: string[]): string {
  if (argv.length !== 2 || argv[0] !== "--origin") {
    throw new Error("USAGE: generate-skill --origin <origin>");
  }

  return argv[1];
}
