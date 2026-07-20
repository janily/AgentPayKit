import {
  lstat,
  mkdtemp,
  readFile,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import {
  readDeterministicTar,
  verifyRelease,
  verifySkillPackageDigest,
  type SignedRelease,
} from "@agentpaykit/publisher";

import { installLayout } from "./layout";
import { InstallError, macosPreflight } from "./preflight";
import { InstallTransaction } from "./transaction";

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function entry(
  entries: ReturnType<typeof readDeterministicTar>,
  path: string,
): Uint8Array {
  const found = entries.find((candidate) => candidate.path === path);
  if (!found) throw new InstallError("INVALID_SKILL_PACKAGE");
  return found.bytes;
}

export async function installSkill(input: {
  home: string;
  packageBytes: Uint8Array;
  clientBytes?: Uint8Array;
  platform?: NodeJS.Platform;
  now?: Date;
  failAt?: "client" | "skill" | "codex" | "claude" | "doctor";
}): Promise<ReturnType<typeof installLayout>> {
  macosPreflight(input.platform ?? process.platform);
  const entries = readDeterministicTar(input.packageBytes);
  const release = JSON.parse(
    new TextDecoder().decode(entry(entries, "release.json")),
  ) as SignedRelease;
  const manifest = JSON.parse(
    new TextDecoder().decode(entry(entries, "skill/agentpay.json")),
  ) as { name?: unknown };
  if (
    typeof manifest.name !== "string" ||
    !/^[a-z][a-z0-9-]{1,62}$/.test(manifest.name)
  ) {
    throw new InstallError("INVALID_SKILL_MANIFEST");
  }
  if (
    !(await verifySkillPackageDigest(
      input.packageBytes,
      release.payload.packageDigest,
    ))
  ) {
    throw new InstallError("PACKAGE_DIGEST_MISMATCH");
  }
  await verifyRelease(release, { now: input.now });
  const layout = installLayout(
    input.home,
    manifest.name,
    release.payload.releaseId,
  );
  const hasClient = await exists(layout.clientBin);
  const hasConfig = await exists(layout.configFile);
  if (!hasClient && !input.clientBytes) {
    throw new InstallError(
      "AGENTPAY_CLIENT_MISSING",
      "agentpay install-client",
    );
  }
  const packageExists = await exists(layout.packageFile);
  if (packageExists) {
    const installed = await readFile(layout.packageFile);
    if (!installed.equals(Buffer.from(input.packageBytes))) {
      throw new InstallError("SKILL_RELEASE_CONFLICT");
    }
  }
  for (const path of [layout.codexEntry, layout.claudeEntry]) {
    if (await exists(path)) {
      const info = await lstat(path);
      if (!info.isSymbolicLink())
        throw new InstallError("AGENT_ENTRY_CONFLICT");
      if ((await readlink(path)) !== layout.currentEntry) {
        throw new InstallError("AGENT_ENTRY_CONFLICT");
      }
    }
  }
  const staging = await mkdtemp(join(input.home, ".agentpaykit-stage-"));
  await writeFile(join(staging, "package.apkg"), input.packageBytes, {
    mode: 0o600,
  });
  if (!hasClient) {
    await writeFile(join(staging, "agentpay"), input.clientBytes!, {
      mode: 0o700,
    });
  }
  const transaction = new InstallTransaction();
  try {
    if (!hasClient) {
      await transaction.file(
        layout.clientBin,
        await readFile(join(staging, "agentpay")),
        0o700,
      );
      if (input.failAt === "client") throw new Error("INJECTED_WRITE_FAILURE");
    }
    if (!hasConfig) {
      await transaction.file(
        layout.configFile,
        new TextEncoder().encode(
          `${JSON.stringify({
            schemaVersion: "1",
            budget: { singleLimit: "10000", dailyLimit: "20000" },
          })}\n`,
        ),
      );
    }
    if (!packageExists) {
      await transaction.file(
        layout.packageFile,
        await readFile(join(staging, "package.apkg")),
      );
      if (input.failAt === "skill") throw new Error("INJECTED_WRITE_FAILURE");
    }
    const adapter = `Use the shared AgentPayKit client at ${layout.clientBin}.\nInvoke this paid skill with \`${layout.clientBin} invoke --skill ${layout.packageFile} --input '<json>'\`.\n`;
    const adapterFile = `${layout.skillRoot}/SKILL.md`;
    if (!(await exists(adapterFile)))
      await transaction.file(adapterFile, new TextEncoder().encode(adapter));
    if (await exists(layout.currentEntry)) {
      const previous = await readlink(layout.currentEntry);
      if (previous !== adapterFile) {
        await transaction.replaceLink(
          layout.currentEntry,
          adapterFile,
          previous,
        );
      }
    } else {
      await transaction.link(layout.currentEntry, adapterFile);
    }
    if (!(await exists(layout.codexEntry)))
      await transaction.link(layout.codexEntry, layout.currentEntry);
    if (input.failAt === "codex") throw new Error("INJECTED_WRITE_FAILURE");
    if (!(await exists(layout.claudeEntry)))
      await transaction.link(layout.claudeEntry, layout.currentEntry);
    if (input.failAt === "claude" || input.failAt === "doctor") {
      throw new Error("INJECTED_WRITE_FAILURE");
    }
    await doctorInstall(layout);
    return layout;
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function doctorInstall(
  layout: ReturnType<typeof installLayout>,
): Promise<void> {
  for (const path of [
    layout.clientBin,
    layout.configFile,
    layout.packageFile,
    layout.currentEntry,
    layout.codexEntry,
    layout.claudeEntry,
  ]) {
    if (!(await exists(path))) throw new InstallError("INSTALL_DOCTOR_FAILED");
  }
}
