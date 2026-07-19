import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

import {
  scenarioNames,
  scenarios,
  type ScenarioName,
  type ScenarioOutcome,
} from "./scenarios/runner";

const enabled = process.env.AGENTPAY_E2E_SEPOLIA === "1";
const REQUIRED_ENV = [
  "CDP_API_KEY_ID",
  "CDP_API_KEY_SECRET",
  "CLOUDFLARE_ACCOUNT_ID",
  "SEPOLIA_E2E_DRIVER",
  "SEPOLIA_PAYEE_ADDRESS",
  "SEPOLIA_RELEASE_FILE",
  "SEPOLIA_RPC_URL",
  "SEPOLIA_RUNTIME_URL",
  "SEPOLIA_USDC_ADDRESS",
  "SEPOLIA_WALLET_ADDRESS",
] as const;

type Environment = Record<(typeof REQUIRED_ENV)[number], string>;

interface ScenarioEvidence {
  name: ScenarioName;
  mode: "chain" | "bridge";
  actual: ScenarioOutcome;
  invocationId?: string;
  transactionHash?: string;
  receiptDigest?: string;
  authorizationUsed: boolean;
  userSpendDelta: string;
  payeeBalanceDelta: string;
}

interface SepoliaDriver {
  run(input: {
    environment: Omit<Environment, "CDP_API_KEY_SECRET">;
    secret: string;
  }): Promise<ScenarioEvidence[]>;
}

function environment(): Environment {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Base Sepolia gate is enabled but required variables are missing: ${missing.join(", ")}. No transaction was broadcast.`,
    );
  }
  return Object.fromEntries(
    REQUIRED_ENV.map((name) => [name, process.env[name]!]),
  ) as Environment;
}

function address(value: string, name: string): void {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`INVALID_${name}`);
}

async function rpc<T>(url: string, method: string, params: unknown[]) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as { result?: T; error?: unknown };
  if (!response.ok || body.error || body.result === undefined) {
    throw new Error(`SEPOLIA_RPC_${method}_FAILED`);
  }
  return body.result;
}

async function balance(env: Environment): Promise<bigint> {
  const account = env.SEPOLIA_WALLET_ADDRESS.slice(2).padStart(64, "0");
  return BigInt(
    await rpc<string>(env.SEPOLIA_RPC_URL, "eth_call", [
      { to: env.SEPOLIA_USDC_ADDRESS, data: `0x70a08231${account}` },
      "latest",
    ]),
  );
}

describe.skipIf(!enabled)("Base Sepolia release gate", () => {
  test("passes all twelve scenarios with chain and Bridge evidence", async () => {
    const env = environment();
    address(env.SEPOLIA_PAYEE_ADDRESS, "PAYEE");
    address(env.SEPOLIA_USDC_ADDRESS, "USDC");
    address(env.SEPOLIA_WALLET_ADDRESS, "WALLET");
    expect(new URL(env.SEPOLIA_RUNTIME_URL).protocol).toBe("https:");

    const releaseDocument = JSON.parse(
      await (
        await import("node:fs/promises")
      ).readFile(env.SEPOLIA_RELEASE_FILE, "utf8"),
    ) as {
      payload?: unknown;
    };
    const release = (releaseDocument.payload ?? releaseDocument) as {
      releaseId?: string;
      environment?: string;
      network?: string;
      amount?: string;
      payee?: string;
    };
    expect(release).toMatchObject({
      environment: "testnet",
      network: "eip155:84532",
      amount: "10000",
      payee: env.SEPOLIA_PAYEE_ADDRESS,
    });
    expect(await balance(env)).toBeGreaterThanOrEqual(10_000n);

    const module = (await import(
      pathToFileURL(resolve(env.SEPOLIA_E2E_DRIVER)).href
    )) as Partial<SepoliaDriver>;
    if (typeof module.run !== "function") {
      throw new Error("SEPOLIA_E2E_DRIVER must export run(input)");
    }
    const { CDP_API_KEY_SECRET: secret, ...publicEnvironment } = env;
    const evidence = await module.run({
      environment: publicEnvironment,
      secret,
    });
    expect(evidence.map(({ name }) => name).sort()).toEqual(
      [...scenarioNames].sort(),
    );

    const chainScenarios = new Set<ScenarioName>([
      "happy-path",
      "concurrent-submit",
      "handler-timeout",
      "policy-failed",
      "settle-recovery",
      "cli-resume",
    ]);
    for (const result of evidence) {
      expect(result.actual).toEqual(scenarios[result.name].expected);
      expect(result.mode).toBe(
        chainScenarios.has(result.name) ? "chain" : "bridge",
      );
      if (result.actual.transferCount === 1) {
        expect(result.transactionHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
        expect(result.receiptDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(result.authorizationUsed).toBe(true);
        expect(result.userSpendDelta).toBe("10000");
        expect(result.payeeBalanceDelta).toBe("10000");
      } else {
        expect(result.authorizationUsed).toBe(false);
        expect(result.userSpendDelta).toBe("0");
        expect(result.payeeBalanceDelta).toBe("0");
      }
    }

    const report = {
      schemaVersion: "1",
      capturedAt: new Date().toISOString(),
      network: "eip155:84532",
      releaseId: release.releaseId,
      passed: evidence.length,
      failed: 0,
      scenarios: evidence.map(({ name, mode, actual, ...item }) => ({
        name,
        mode,
        finalStatus: actual.finalStatus,
        chargeState: actual.chargeState,
        ...item,
      })),
    };
    await writeFile(
      "artifacts/e2e-sepolia.json",
      `${JSON.stringify(report, null, 2)}\n`,
      { mode: 0o600 },
    );
    expect(report).toMatchObject({ passed: 12, failed: 0 });
  }, 600_000);
});
