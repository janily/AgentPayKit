import {
  cp,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

export class ScaffoldError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ScaffoldError";
  }
}

export async function scaffoldPaidSkill(input: {
  name: string;
  directory: string;
  templateRoot?: string;
}): Promise<string> {
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(input.name)) {
    throw new ScaffoldError("INVALID_SKILL_NAME");
  }
  const target = resolve(input.directory, input.name);
  try {
    await stat(target);
    throw new ScaffoldError("TARGET_EXISTS");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const templateRoot =
    input.templateRoot ??
    new URL("../templates/paid-skill/", import.meta.url).pathname;
  await mkdir(target, { recursive: false });
  await cp(templateRoot, target, { recursive: true, errorOnExist: true });
  await replaceTokens(target, input.name);
  return target;
}

async function replaceTokens(directory: string, name: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await replaceTokens(path, name);
    } else {
      const contents = await readFile(path, "utf8");
      await writeFile(
        path,
        contents
          .replaceAll("{{skillName}}", name)
          .replaceAll("{{className}}", className(name)),
      );
    }
  }
}

function className(name: string): string {
  return name
    .split("-")
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join("");
}

export async function scaffoldTree(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else files.push(path.slice(root.length + 1));
    }
  }
  await visit(root);
  return files.sort();
}
