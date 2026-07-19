import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, join, posix, relative, resolve } from "node:path";

import { packageDigest, type PackageDigest } from "@agentpaykit/protocol";

import {
  deterministicTar,
  readDeterministicTar,
  type ArchiveEntry,
} from "./archive";
import type { SignedRelease } from "./release-signer";

const forbiddenName =
  /(^|\/)(\.env(?:\.|$)|.*(?:private[-_]?key|mnemonic|seed).*)/i;
const forbiddenContent =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:CLOUDFLARE_API_TOKEN|CDP_API_KEY|CDP_API_SECRET|MNEMONIC|SEED_PHRASE)\s*[:=]/i;

export interface BuiltSkillPackage {
  bytes: Uint8Array;
  digest: PackageDigest;
}

export interface PreparedSkillPackage {
  entries: ArchiveEntry[];
  digest: PackageDigest;
}

async function files(root: string): Promise<string[]> {
  const found: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (
        ["node_modules", ".git", "dist", ".turbo", "test"].includes(entry.name)
      )
        continue;
      if (entry.name.endsWith(".tsbuildinfo")) continue;
      const path = join(directory, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error("SYMLINK_NOT_ALLOWED");
      if (info.isDirectory()) await visit(path);
      else if (info.isFile())
        found.push(relative(root, path).split("\\").join("/"));
      else throw new Error("UNSUPPORTED_FILE_TYPE");
    }
  }
  await visit(root);
  return found.sort();
}

export async function prepareSkillPackage(
  inputRoot: string,
): Promise<PreparedSkillPackage> {
  const root = resolve(inputRoot);
  const manifestBytes = await readFile(join(root, "agentpay.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    files?: unknown;
  };
  if (
    !Array.isArray(manifest.files) ||
    !manifest.files.every((file) => typeof file === "string")
  ) {
    throw new Error("PACKAGE_FILES_REQUIRED");
  }
  if (
    manifest.files.some(
      (file) => file.startsWith("/") || file.split("/").includes(".."),
    )
  ) {
    throw new Error("UNSAFE_PACKAGE_PATH");
  }
  const declared = new Set(["agentpay.json", ...manifest.files]);
  const discovered = await files(root);
  for (const path of discovered) {
    if (path.startsWith("/") || path.split("/").includes(".."))
      throw new Error("UNSAFE_PACKAGE_PATH");
    if (!declared.has(path)) throw new Error(`UNDECLARED_FILE:${path}`);
  }
  for (const path of declared) {
    if (!discovered.includes(path))
      throw new Error(`DECLARED_FILE_MISSING:${path}`);
  }
  const entries: ArchiveEntry[] = [];
  for (const path of discovered) {
    const bytes = await readFile(join(root, ...path.split("/")));
    const text = new TextDecoder().decode(bytes);
    if (forbiddenName.test(path) || forbiddenContent.test(text))
      throw new Error(`SECRET_FILE_REJECTED:${basename(path)}`);
    entries.push({ path: posix.join("skill", path), bytes });
  }
  entries.push(
    {
      path: "install.json",
      bytes: new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: "1",
          sharedClientRequired: true,
          clientCompatibility: ">=0.1.0 <1.0.0",
        }),
      ),
    },
    {
      path: "adapters/codex.md",
      bytes: new TextEncoder().encode(
        "Run `agentpay invoke --skill ./installed-skill.json --input <json>`.\n",
      ),
    },
    {
      path: "adapters/claude-code.md",
      bytes: new TextEncoder().encode(
        "Run `agentpay invoke --skill ./installed-skill.json --input <json>`.\n",
      ),
    },
  );
  return { entries, digest: await packageDigest(deterministicTar(entries)) };
}

export async function buildSkillPackage(input: {
  root: string;
  release: SignedRelease;
}): Promise<BuiltSkillPackage> {
  const prepared = await prepareSkillPackage(input.root);
  if (input.release.payload.packageDigest !== prepared.digest) {
    throw new Error("RELEASE_PACKAGE_DIGEST_MISMATCH");
  }
  const bytes = deterministicTar([
    ...prepared.entries,
    {
      path: "release.json",
      bytes: new TextEncoder().encode(JSON.stringify(input.release)),
    },
  ]);
  return { bytes, digest: prepared.digest };
}

export async function verifySkillPackageDigest(
  bytes: Uint8Array,
  expected: PackageDigest,
): Promise<boolean> {
  const core = readDeterministicTar(bytes).filter(
    ({ path }) => path !== "release.json",
  );
  return (await packageDigest(deterministicTar(core))) === expected;
}
