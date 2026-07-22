import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { validateProjectName } from "./names.js";

export interface ScaffoldOptions {
  cwd: string;
  projectName: string;
  beforeWrite?(file: string, destination: string): void | Promise<void>;
}

export interface ScaffoldResult {
  directory: string;
  files: string[];
}

const templateDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../template",
);

export async function scaffold({
  cwd,
  projectName,
  beforeWrite,
}: ScaffoldOptions): Promise<ScaffoldResult> {
  const name = validateProjectName(projectName);
  const directory = join(cwd, name);
  await mkdir(cwd, { recursive: true });
  await ensureNewTarget(directory);

  const templateFiles = await listTemplateFiles(templateDirectory);
  const files = templateFiles.map(outputPathFromTemplate).sort();

  for (const templateFile of templateFiles) {
    const file = outputPathFromTemplate(templateFile);
    const source = join(templateDirectory, templateFile);
    const destination = join(directory, file);
    const contents = await readFile(source, "utf8");
    const parent = dirname(destination);
    await mkdir(parent, { recursive: true });
    await beforeWrite?.(file, destination);
    await ensureSafeParent(directory, parent);

    try {
      await writeFile(
        destination,
        contents.replaceAll("__PROJECT_NAME__", name),
        {
          flag: "wx",
        },
      );
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        throw new Error("TARGET_FILE_EXISTS");
      }
      throw error;
    }
  }

  return { directory, files };
}

async function ensureSafeParent(
  directory: string,
  parent: string,
): Promise<void> {
  const pathInsideTarget = relative(directory, parent);
  if (
    isAbsolute(pathInsideTarget) ||
    pathInsideTarget === ".." ||
    pathInsideTarget.startsWith(`..${sep}`)
  ) {
    throw new Error("UNSAFE_TARGET_DIRECTORY");
  }

  let current = directory;
  await ensureRealDirectory(current);
  for (const segment of pathInsideTarget.split(sep)) {
    if (segment === "") {
      continue;
    }
    current = join(current, segment);
    await ensureRealDirectory(current);
  }
}

async function ensureRealDirectory(path: string): Promise<void> {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("UNSAFE_TARGET_DIRECTORY");
  }
}

function outputPathFromTemplate(templateFile: string): string {
  return templateFile === "_gitignore" ? ".gitignore" : templateFile;
}

async function ensureNewTarget(directory: string): Promise<void> {
  try {
    await mkdir(directory);
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }

    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch {
      throw new Error("TARGET_DIRECTORY_EXISTS");
    }

    if (entries.length > 0) {
      throw new Error("TARGET_DIRECTORY_NOT_EMPTY");
    }

    throw new Error("TARGET_DIRECTORY_EXISTS");
  }
}

async function listTemplateFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (entry.isFile()) {
      files.push(relative(directory, join(entry.parentPath, entry.name)));
    }
  }

  return files.sort();
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}
