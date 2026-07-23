import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { validateProjectName } from "../src/names.js";
import { scaffold } from "../src/scaffold.js";

const TEMPLATE_FILES = [
  ".gitignore",
  "LICENSE",
  "README.md",
  "agentpay.skill.ts",
  "app/api/invoke/route.ts",
  "next.config.ts",
  "package.json",
  "scripts/clean.mjs",
  "scripts/deploy.ts",
  "scripts/generate-skill.ts",
  "scripts/lib/deploy.ts",
  "scripts/lib/run.ts",
  "src/review-repository.ts",
  "test/deploy.test.ts",
  "test/run.test.ts",
  "test/skill.test.ts",
  "tsconfig.json",
  "vercel.json",
];

describe("create-agentpay-skill scaffold", () => {
  it("refuses a non-empty target directory", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentpaykit-scaffold-"));
    const projectName = "paid-review";
    const target = join(cwd, projectName);
    await mkdir(target);
    await writeFile(join(target, "keep.txt"), "user data");

    await expect(scaffold({ cwd, projectName })).rejects.toThrow(
      "TARGET_DIRECTORY_NOT_EMPTY",
    );
    expect(await readFile(join(target, "keep.txt"), "utf8")).toBe("user data");
  });

  it.each(["Paid Review", "../escape", "@scope/name", "paid_review"])(
    "rejects unsafe name %s",
    (name) =>
      expect(() => validateProjectName(name)).toThrow("INVALID_PROJECT_NAME"),
  );

  it("rejects names longer than npm's 214-character limit", () => {
    expect(() => validateProjectName(`a${"b".repeat(214)}`)).toThrow(
      "INVALID_PROJECT_NAME",
    );
  });

  it("does not create a traversal target", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentpaykit-scaffold-"));

    await expect(scaffold({ cwd, projectName: "../escape" })).rejects.toThrow(
      "INVALID_PROJECT_NAME",
    );
  });

  it("refuses an existing empty target directory", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentpaykit-scaffold-"));
    await mkdir(join(cwd, "paid-review"));

    await expect(scaffold({ cwd, projectName: "paid-review" })).rejects.toThrow(
      "TARGET_DIRECTORY_EXISTS",
    );
  });

  it("generates exactly the template tree with substituted names", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentpaykit-scaffold-"));
    const projectName = "paid-review";

    const result = await scaffold({ cwd, projectName });

    expect(result.directory).toBe(join(cwd, projectName));
    expect(result.files).toEqual(TEMPLATE_FILES);
    expect(await listFiles(result.directory)).toEqual(TEMPLATE_FILES);
    expect(
      await readFile(join(result.directory, "package.json"), "utf8"),
    ).toContain('"name": "paid-review"');
    expect(
      await readFile(join(result.directory, "agentpay.skill.ts"), "utf8"),
    ).toContain('name: "paid-review"');
    await expectNoPlaceholderTokens(result.directory);
  });

  it("does not overwrite a file created by a competing writer", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentpaykit-scaffold-"));
    const target = join(cwd, "paid-review");

    await expect(
      scaffold({
        cwd,
        projectName: "paid-review",
        beforeWrite: async (file, destination) => {
          if (file === "README.md") {
            await writeFile(destination, "user data");
          }
        },
      }),
    ).rejects.toThrow("TARGET_FILE_EXISTS");
    expect(await readFile(join(target, "README.md"), "utf8")).toBe("user data");
  });

  it("refuses a symlinked intermediate parent before writing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "agentpaykit-scaffold-"));
    const target = join(cwd, "paid-review");
    const outside = await mkdtemp(join(tmpdir(), "agentpaykit-outside-"));

    await expect(
      scaffold({
        cwd,
        projectName: "paid-review",
        beforeWrite: async (file) => {
          if (file === "app/api/invoke/route.ts") {
            await rm(join(target, "app"), { recursive: true });
            await symlink(outside, join(target, "app"));
          }
        },
      }),
    ).rejects.toThrow("UNSAFE_TARGET_DIRECTORY");
    await expect(
      readFile(join(outside, "api", "invoke", "route.ts")),
    ).rejects.toThrow("ENOENT");
  });

  it("creates a missing cwd before generating the project", async () => {
    const parent = await mkdtemp(join(tmpdir(), "agentpaykit-scaffold-"));
    const cwd = join(parent, "missing", "nested-cwd");

    const result = await scaffold({ cwd, projectName: "paid-review" });

    expect(await listFiles(result.directory)).toEqual(TEMPLATE_FILES);
  });

  it("produces deterministic files outside name substitutions", async () => {
    const firstCwd = await mkdtemp(join(tmpdir(), "agentpaykit-scaffold-"));
    const secondCwd = await mkdtemp(join(tmpdir(), "agentpaykit-scaffold-"));
    const first = await scaffold({ cwd: firstCwd, projectName: "paid-review" });
    const second = await scaffold({
      cwd: secondCwd,
      projectName: "paid-audit",
    });

    for (const file of TEMPLATE_FILES) {
      const firstContents = await readFile(join(first.directory, file), "utf8");
      const secondContents = await readFile(
        join(second.directory, file),
        "utf8",
      );
      expect(normalizeName(firstContents, "paid-review")).toBe(
        normalizeName(secondContents, "paid-audit"),
      );
    }
  });
});

function normalizeName(contents: string, projectName: string): string {
  return contents
    .replaceAll(`"name": "${projectName}"`, '"name": "__PROJECT_NAME__"')
    .replaceAll(`name: "${projectName}"`, 'name: "__PROJECT_NAME__"')
    .replaceAll(`# \`${projectName}\``, "# `__PROJECT_NAME__`");
}

async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = join(prefix, entry.name);
      return entry.isDirectory()
        ? listFiles(join(directory, entry.name), relativePath)
        : [relativePath];
    }),
  );

  return files.flat().sort();
}

async function expectNoPlaceholderTokens(directory: string): Promise<void> {
  for (const file of await listFiles(directory)) {
    await expect(readFile(join(directory, file), "utf8")).resolves.not.toMatch(
      /__PROJECT_NAME__|\*\*PROJECT_NAME\*\*/,
    );
  }
}
