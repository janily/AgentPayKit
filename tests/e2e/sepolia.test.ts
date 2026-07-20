import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";
import { keccak256, stringToHex } from "viem";

import {
  digestJson,
  parseSignedReceipt,
  parseStatusEnvelope,
  verifyCanonicalSignature,
  type CanonicalSignature,
} from "../../packages/protocol/src/index";

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

async function balance(env: Environment, address: string): Promise<bigint> {
  const account = address.slice(2).padStart(64, "0");
  return BigInt(
    await rpc<string>(env.SEPOLIA_RPC_URL, "eth_call", [
      { to: env.SEPOLIA_USDC_ADDRESS, data: `0x70a08231${account}` },
      "latest",
    ]),
  );
}

async function runtimeJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`RUNTIME_HTTP_${response.status}`);
  return response.json();
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
      runtimeDelegation?: {
        payload?: { runtimeKeyId?: string; runtimePublicKey?: string };
      };
    };
    expect(release).toMatchObject({
      environment: "testnet",
      network: "eip155:84532",
      amount: "10000",
      payee: env.SEPOLIA_PAYEE_ADDRESS,
    });
    expect(release.releaseId).toMatch(/^rel_[0-9a-f]{64}$/);
    const walletBefore = await balance(env, env.SEPOLIA_WALLET_ADDRESS);
    const payeeBefore = await balance(env, env.SEPOLIA_PAYEE_ADDRESS);
    expect(walletBefore).toBeGreaterThanOrEqual(10_000n);

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
    const runtimeIdentity = release.runtimeDelegation?.payload as {
      runtimeKeyId?: string;
      runtimePublicKey?: string;
    };
    const runtimePublicKey = Uint8Array.from(
      Buffer.from(runtimeIdentity.runtimePublicKey ?? "", "base64url"),
    );
    expect(runtimePublicKey).toHaveLength(32);
    const transferTopic =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const authorizationTopic = keccak256(
      stringToHex("AuthorizationUsed(address,bytes32)"),
    );
    const verifiedEvidence: Array<Record<string, unknown>> = [];
    const transactions = new Set<string>();
    for (const result of evidence) {
      expect(result.mode).toBe(
        chainScenarios.has(result.name) ? "chain" : "bridge",
      );
      let actual = result.actual;
      let verifiedReceiptDigest: string | undefined;
      let blockNumber: string | undefined;
      if (result.mode === "chain") {
        expect(result.invocationId).toMatch(/^inv_[0-9A-HJKMNP-TV-Z]{26}$/);
        const signedStatus = (await runtimeJson(
          new URL(
            `/v1/invocations/${result.invocationId}/status`,
            env.SEPOLIA_RUNTIME_URL,
          ).toString(),
        )) as { payload: unknown; signature: CanonicalSignature };
        const status = parseStatusEnvelope(signedStatus.payload);
        expect(
          await verifyCanonicalSignature(
            "runtime-status-v1",
            status,
            signedStatus.signature,
            runtimePublicKey,
          ),
        ).toBe(true);
        actual = {
          ...actual,
          finalStatus: status.status,
          chargeState: status.chargeState,
        };
      }
      expect(actual).toEqual(scenarios[result.name].expected);
      if (result.actual.transferCount === 1) {
        expect(result.transactionHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
        expect(transactions.has(result.transactionHash!.toLowerCase())).toBe(
          false,
        );
        transactions.add(result.transactionHash!.toLowerCase());
        const chainReceipt = await rpc<{
          status: string;
          blockNumber: string;
          blockHash: string;
          logs: Array<{ address: string; topics: string[]; data: string }>;
        }>(env.SEPOLIA_RPC_URL, "eth_getTransactionReceipt", [
          result.transactionHash,
        ]);
        expect(chainReceipt.status).toBe("0x1");
        expect(chainReceipt.blockHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
        blockNumber = chainReceipt.blockNumber;
        const assetLogs = chainReceipt.logs.filter(
          ({ address: logAddress }) =>
            logAddress.toLowerCase() === env.SEPOLIA_USDC_ADDRESS.toLowerCase(),
        );
        expect(
          assetLogs.some(
            ({ topics, data }) =>
              topics[0]?.toLowerCase() === transferTopic &&
              topics[2]?.slice(-40).toLowerCase() ===
                env.SEPOLIA_PAYEE_ADDRESS.slice(2).toLowerCase() &&
              BigInt(data) === 10_000n,
          ),
        ).toBe(true);
        expect(
          assetLogs.some(
            ({ topics }) =>
              topics[0]?.toLowerCase() === authorizationTopic.toLowerCase(),
          ),
        ).toBe(true);
        const signedReceipt = parseSignedReceipt(
          await runtimeJson(
            new URL(
              `/v1/invocations/${result.invocationId}/receipt`,
              env.SEPOLIA_RUNTIME_URL,
            ).toString(),
          ),
        );
        expect(signedReceipt.payload).toMatchObject({
          invocationId: result.invocationId,
          transactionHash: result.transactionHash,
          amount: "10000",
          payee: env.SEPOLIA_PAYEE_ADDRESS,
          network: "eip155:84532",
        });
        expect(
          await verifyCanonicalSignature(
            "runtime-receipt-v1",
            signedReceipt.payload,
            signedReceipt.signature,
            runtimePublicKey,
          ),
        ).toBe(true);
        verifiedReceiptDigest = await digestJson(signedReceipt);
      } else {
        expect(result.transactionHash).toBeUndefined();
      }
      verifiedEvidence.push({
        name: result.name,
        mode: result.mode,
        invocationId: result.invocationId,
        transactionHash: result.transactionHash,
        blockNumber,
        receiptDigest: verifiedReceiptDigest,
        finalStatus: actual.finalStatus,
        chargeState: actual.chargeState,
      });
    }

    const chargedCount = evidence.filter(
      ({ actual }) => actual.transferCount === 1,
    ).length;
    const walletAfter = await balance(env, env.SEPOLIA_WALLET_ADDRESS);
    const payeeAfter = await balance(env, env.SEPOLIA_PAYEE_ADDRESS);
    expect(walletBefore - walletAfter).toBe(BigInt(chargedCount * 10_000));
    expect(payeeAfter - payeeBefore).toBe(BigInt(chargedCount * 10_000));

    const report = {
      schemaVersion: "1",
      capturedAt: new Date().toISOString(),
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      network: "eip155:84532",
      releaseId: release.releaseId,
      passed: evidence.length,
      failed: 0,
      walletSpendDelta: (walletBefore - walletAfter).toString(),
      payeeBalanceDelta: (payeeAfter - payeeBefore).toString(),
      scenarios: verifiedEvidence,
    };
    await writeFile(
      "artifacts/e2e-sepolia.json",
      `${JSON.stringify(report, null, 2)}\n`,
      { mode: 0o600 },
    );
    expect(report).toMatchObject({ passed: 12, failed: 0 });
  }, 600_000);
});
