import {
  lstat,
  mkdir,
  rename,
  rm,
  rmdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";

export class InstallTransaction {
  private readonly created: string[] = [];
  private readonly createdDirectories: string[] = [];
  private readonly replaced: Array<{ path: string; target: string }> = [];

  async file(path: string, bytes: Uint8Array, mode = 0o600): Promise<void> {
    await this.ensureDirectory(dirname(path));
    await writeFile(path, bytes, { flag: "wx", mode });
    this.created.push(path);
  }

  async link(path: string, target: string): Promise<void> {
    await this.ensureDirectory(dirname(path));
    const temporary = `${path}.${process.pid}.tmp`;
    await symlink(target, temporary);
    this.created.push(temporary);
    await rename(temporary, path);
    this.created[this.created.length - 1] = path;
  }

  async replaceLink(
    path: string,
    target: string,
    previousTarget: string,
  ): Promise<void> {
    const temporary = `${path}.${process.pid}.tmp`;
    await symlink(target, temporary);
    await rename(temporary, path);
    this.replaced.push({ path, target: previousTarget });
  }

  async rollback(): Promise<void> {
    for (const replacement of [...this.replaced].reverse()) {
      const temporary = `${replacement.path}.${process.pid}.rollback`;
      await symlink(replacement.target, temporary);
      await rename(temporary, replacement.path);
    }
    for (const path of [...this.created].reverse()) {
      await rm(path, { force: true, recursive: true });
    }
    for (const directory of [...this.createdDirectories].reverse()) {
      await rmdir(directory).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
      });
    }
  }

  private async ensureDirectory(directory: string): Promise<void> {
    try {
      await lstat(directory);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = dirname(directory);
    if (parent !== directory) await this.ensureDirectory(parent);
    await mkdir(directory, { mode: 0o700 });
    this.createdDirectories.push(directory);
  }
}
