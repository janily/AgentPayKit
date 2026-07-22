import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const excludedSegments = new Set([
  ".git",
  ".cache",
  ".next",
  ".nyc_output",
  ".pnpm-store",
  ".storybook-static",
  ".superpowers",
  ".turbo",
  ".vercel",
  ".yarn",
  "build",
  "coverage",
  "dist",
  "dist-worker",
  "docker-volumes",
  "logs",
  "node_modules",
  "out",
  "temp",
  "tmp",
]);
const scannedExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".sh",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const scannedNames = new Set([
  ".env.example",
  ".npmrc",
  "Dockerfile",
  "Makefile",
]);

async function relevantFiles(
  scanRoot: string,
  directory = scanRoot,
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excludedSegments.has(entry.name)) continue;
    const path = join(directory, entry.name);
    const repositoryPath = relative(scanRoot, path).replaceAll("\\", "/");
    if (
      repositoryPath.startsWith("docs/superpowers/") ||
      repositoryPath.startsWith("docs/acceptance/evidence/")
    ) {
      continue;
    }
    if (entry.isDirectory())
      files.push(...(await relevantFiles(scanRoot, path)));
    else if (
      entry.isFile() &&
      (scannedNames.has(entry.name) ||
        scannedExtensions.has(extname(entry.name)))
    )
      files.push(path);
  }
  return files;
}

export function sensitiveMaterialFindings(
  path: string,
  content: string,
): string[] {
  const problems: string[] = [];
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
    problems.push("private-key material");
  }
  if (
    /(?:private[_-]?key|mnemonic|seed[_ -]?phrase)\s*[:=]\s*["'][A-Za-z0-9+/ ]{32,}["']/i.test(
      content,
    )
  ) {
    problems.push("credential assignment");
  }
  const walletConnectUris =
    content.match(/wc:[A-Za-z0-9][A-Za-z0-9?&=._:@/-]*/g) ?? [];
  const portablePath = path.replaceAll("\\", "/");
  const unsafeWalletConnectUris = walletConnectUris.filter(
    (value) =>
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(portablePath) ||
      !/^wc:(?:private|official)-(?:[a-z]+-)*uri$/.test(value),
  );
  if (unsafeWalletConnectUris.length > 0) problems.push("WalletConnect URI");
  if (
    /(?:["']?PAYMENT-(?:SIGNATURE|REQUIRED)["']?)\s*[:=]\s*["'](?:0x[0-9a-f]{32,}|[A-Za-z0-9+/_-]{40,}={0,2})["']/i.test(
      content,
    )
  ) {
    problems.push("raw payment header");
  }
  return problems;
}

export async function scanSensitiveMaterial(
  scanRoot: string,
): Promise<string[]> {
  const violations: string[] = [];
  for (const path of await relevantFiles(scanRoot)) {
    for (const finding of sensitiveMaterialFindings(
      path,
      await readFile(path, "utf8"),
    )) {
      violations.push(`${relative(scanRoot, path)}: ${finding}`);
    }
  }
  return violations;
}

describe("repository sensitive-material policy", () => {
  it("detects representative raw credentials without relying on platform paths", () => {
    const privateKey = `0x${"a".repeat(64)}`;
    const walletUri = `w${"c"}:${"a".repeat(64)}@2?relay-protocol=irn`;
    const payment = `${"PAYMENT"}-SIGNATURE=${JSON.stringify(
      Buffer.alloc(48, 1).toString("base64"),
    )}`;

    expect(
      sensitiveMaterialFindings(
        "src/config.ts",
        `privateKey = "${privateKey}"`,
      ),
    ).toContain("credential assignment");
    expect(sensitiveMaterialFindings("src/client.ts", walletUri)).toContain(
      "WalletConnect URI",
    );
    expect(sensitiveMaterialFindings("src/client.ts", payment)).toContain(
      "raw payment header",
    );
    expect(
      sensitiveMaterialFindings(
        "C:\\repo\\client.test.ts",
        "wc:private-connection-uri",
      ),
    ).toEqual([]);
  });

  it("contains no current-architecture credentials or reusable payment material", async () => {
    await expect(scanSensitiveMaterial(root)).resolves.toEqual([]);
  });

  it("scans retained extensionless configuration such as .env.example", async () => {
    const scanRoot = await mkdtemp(join(tmpdir(), "agentpay-sensitive-scan-"));
    try {
      const secret = `0x${"b".repeat(64)}`;
      await writeFile(
        join(scanRoot, ".env.example"),
        `PRIVATE_KEY="${secret}"\n`,
        "utf8",
      );

      await expect(scanSensitiveMaterial(scanRoot)).resolves.toEqual([
        ".env.example: credential assignment",
      ]);
    } finally {
      await rm(scanRoot, { recursive: true, force: true });
    }
  });
});
