import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  buildSkillPackage,
  prepareSkillPackage,
  readDeterministicTar,
  verifySkillPackageDigest,
  type SignedRelease,
} from "../src/index";

function release(packageDigest: string) {
  return {
    payload: { packageDigest },
    signature: {
      algorithm: "EIP191",
      signer: `0x${"1".repeat(40)}`,
      value: `0x${"2".repeat(130)}`,
    },
  } as unknown as SignedRelease;
}

async function project(
  files: Record<string, string>,
  declared = Object.keys(files),
) {
  const root = await mkdtemp(join(tmpdir(), "agentpay-package-"));
  await writeFile(
    join(root, "agentpay.json"),
    JSON.stringify({ schemaVersion: "1", files: declared }),
  );
  for (const [path, contents] of Object.entries(files)) {
    await writeFile(join(root, path), contents);
  }
  return root;
}

describe("deterministic skill packages", () => {
  test("produces byte-identical normalized archives", async () => {
    const root = await project({ "handler.ts": "export default {};\n" });
    const prepared = await prepareSkillPackage(root);
    const signed = release(prepared.digest);
    const first = await buildSkillPackage({ root, release: signed });
    const second = await buildSkillPackage({ root, release: signed });

    expect(first.bytes).toEqual(second.bytes);
    expect(first.digest).toBe(second.digest);
    await expect(
      verifySkillPackageDigest(first.bytes, first.digest),
    ).resolves.toBe(true);
    expect(readDeterministicTar(first.bytes).map(({ path }) => path)).toEqual([
      "adapters/claude-code.md",
      "adapters/codex.md",
      "install.json",
      "release.json",
      "skill/agentpay.json",
      "skill/handler.ts",
    ]);
  });

  test("rejects symlinks, traversal, undeclared and secret files", async () => {
    const symlinkRoot = await project({ "handler.ts": "ok" });
    await symlink(
      join(symlinkRoot, "handler.ts"),
      join(symlinkRoot, "link.ts"),
    );
    await expect(prepareSkillPackage(symlinkRoot)).rejects.toThrow(
      "SYMLINK_NOT_ALLOWED",
    );

    const traversal = await project({}, ["../outside"]);
    await expect(prepareSkillPackage(traversal)).rejects.toThrow(
      "UNSAFE_PACKAGE_PATH",
    );

    const undeclared = await project({ "handler.ts": "ok", "extra.ts": "no" }, [
      "handler.ts",
    ]);
    await expect(prepareSkillPackage(undeclared)).rejects.toThrow(
      "UNDECLARED_FILE",
    );

    const secret = await project({
      "config.txt": "CLOUDFLARE_API_TOKEN=forbidden",
    });
    await expect(prepareSkillPackage(secret)).rejects.toThrow(
      "SECRET_FILE_REJECTED",
    );
  });
});
