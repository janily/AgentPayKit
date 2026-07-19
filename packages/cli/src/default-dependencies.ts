import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { LoopbackBridgeServer } from "@agentpaykit/browser-bridge";
import {
  AgentPayClient,
  BudgetStore,
  defaultInputDigest,
  defaultRuntimeSignatureVerifier,
  ReservationService,
  RuntimeHttpClient,
  StrictReleaseVerifier,
  type InstalledSkill,
  type VerifiedInstalledSkill,
} from "@agentpaykit/client";

import type { CliDependencies } from "./main";

const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function invocationId(): string {
  let timestamp = BigInt(Date.now());
  let encodedTime = "";
  for (let index = 0; index < 10; index += 1) {
    encodedTime = crockford[Number(timestamp & 31n)] + encodedTime;
    timestamp >>= 5n;
  }
  const random = [...randomBytes(16)]
    .map((byte) => crockford[byte & 31])
    .join("");
  return `inv_${encodedTime}${random}`;
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("INVALID_PUBLIC_KEY");
  return Uint8Array.from(Buffer.from(value, "base64url"));
}

function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

interface SerializedBinding extends Omit<VerifiedInstalledSkill, "runtime"> {
  runtime: Omit<VerifiedInstalledSkill["runtime"], "publicKey"> & {
    publicKey: string;
  };
}

class FileBindings {
  constructor(private readonly path: string) {}

  private async read(): Promise<Record<string, SerializedBinding>> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as Record<
        string,
        SerializedBinding
      >;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  async get(id: string): Promise<VerifiedInstalledSkill | undefined> {
    const stored = (await this.read())[id];
    return stored
      ? {
          ...stored,
          runtime: {
            ...stored.runtime,
            publicKey: decodeBase64Url(stored.runtime.publicKey),
          },
        }
      : undefined;
  }

  async put(id: string, skill: VerifiedInstalledSkill): Promise<void> {
    const bindings = await this.read();
    bindings[id] = {
      ...skill,
      runtime: {
        ...skill.runtime,
        publicKey: encodeBase64Url(skill.runtime.publicKey),
      },
    };
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(bindings), { mode: 0o600 });
    await rename(temporary, this.path);
  }
}

interface SkillDescriptor {
  packageFile: string;
  release: InstalledSkill["release"];
  publisher: { keyId: string; publicKey: string };
}

async function loadSkill(path: string): Promise<InstalledSkill> {
  const descriptor = JSON.parse(
    await readFile(path, "utf8"),
  ) as SkillDescriptor;
  if (
    typeof descriptor.packageFile !== "string" ||
    typeof descriptor.publisher?.keyId !== "string" ||
    typeof descriptor.publisher?.publicKey !== "string" ||
    typeof descriptor.release !== "object" ||
    descriptor.release === null
  ) {
    throw Object.assign(new Error("INVALID_SKILL_DESCRIPTOR"), {
      code: "INVALID_SKILL_DESCRIPTOR",
    });
  }
  const packagePath = isAbsolute(descriptor.packageFile)
    ? descriptor.packageFile
    : resolve(dirname(path), descriptor.packageFile);
  return {
    packageBytes: await readFile(packagePath),
    release: descriptor.release,
    publisher: {
      keyId: descriptor.publisher.keyId,
      publicKey: decodeBase64Url(descriptor.publisher.publicKey),
    },
  };
}

function openBrowser(url: string): Promise<void> {
  return new Promise((resolveOpen, reject) => {
    const child = spawn("/usr/bin/open", [url], {
      stdio: "ignore",
      detached: false,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolveOpen()
        : reject(
            Object.assign(new Error("BRIDGE_OPEN_FAILED"), {
              code: "BRIDGE_OPEN_FAILED",
            }),
          ),
    );
  });
}

function usdc(amount: string): string {
  const atomic = amount.padStart(7, "0");
  const whole = atomic.slice(0, -6).replace(/^0+(?=\d)/, "");
  const fraction = atomic.slice(-6).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

async function config(path: string): Promise<{
  budget?: { singleLimit: string; dailyLimit: string };
}> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as {
      budget?: { singleLimit: string; dailyLimit: string };
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function createDefaultDependencies(): Promise<CliDependencies> {
  const root = resolve(
    process.env.AGENTPAYKIT_HOME ?? join(homedir(), ".agentpaykit"),
  );
  await mkdir(root, { recursive: true, mode: 0o700 });
  const budgetStore = new BudgetStore(join(root, "budget.sqlite"));
  const localConfig = await config(join(root, "config.json"));
  if (localConfig.budget) budgetStore.configure(localConfig.budget);
  const reservations = new ReservationService(budgetStore);
  const bindings = new FileBindings(join(root, "bindings.json"));
  const client = new AgentPayClient({
    releaseVerifier: new StrictReleaseVerifier(),
    digest: defaultInputDigest,
    runtime: new RuntimeHttpClient(),
    signatureVerifier: defaultRuntimeSignatureVerifier,
    bindings,
    budget: reservations,
    invocationId,
    poll: {
      sleep: (milliseconds) =>
        new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
      maximumWaitMs: 30_000,
    },
    paymentAuthorizer: {
      async authorize({ paymentRequired, quote }) {
        const bridge = await LoopbackBridgeServer.start();
        try {
          const session = bridge.createSession({
            invocationId: quote.invocationId,
            inputDigest: quote.inputDigest,
            amount: usdc(quote.amount),
            payee: quote.payee,
            network: quote.network,
            releaseId: quote.releaseId,
            dataDisclosure:
              "Input is sent only to the selected skill runtime after approval.",
            paymentRequired,
          });
          await openBrowser(session.url);
          const completion = await session.completion;
          if (completion.state !== "approved" || !completion.paymentSignature) {
            throw Object.assign(new Error("WALLET_REJECTED"), {
              code: "WALLET_REJECTED",
              chargeState: "NOT_CHARGED",
            });
          }
          return completion.paymentSignature;
        } finally {
          await bridge.close();
        }
      },
    },
  });
  return {
    platform: process.platform,
    client,
    loadSkill,
    spend: async () => reservations.summary(new Date()),
    writeStdout: (line) => process.stdout.write(`${line}\n`),
    writeStderr: (line) => process.stderr.write(`${line}\n`),
    signals: {
      on: (signal, handler) => process.on(signal, handler),
      off: (signal, handler) => process.off(signal, handler),
    },
  };
}
