import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { LoopbackBridgeServer } from "../../packages/browser-bridge/src/index";
import { installSkill } from "../../packages/installer/src/index";
import { signCanonical } from "../../packages/protocol/src/index";
import { expect, test } from "vitest";

import { securityPackageFixture } from "../security/helpers/package-fixture";

const execute = promisify(execFile);

test("one install gives both agents the same complete production client", async () => {
  const home = await mkdtemp(join(tmpdir(), "agentpay-dual-home-"));
  const built = await securityPackageFixture();
  const client = await readFile("packages/cli/dist/index.js");
  expect(client.toString("utf8")).toContain(
    "AGENTPAYKIT_EMBEDDED_BRIDGE_ASSETS",
  );
  const layout = await installSkill({
    home,
    packageBytes: built.bytes,
    clientBytes: client,
    platform: "darwin",
    now: new Date("2026-07-20T00:00:00.000Z"),
  });
  const invocationId = "inv_01J00000000000000000000000";
  const status = {
    schemaVersion: "1" as const,
    invocationId,
    status: "QUEUED" as const,
    chargeState: "NOT_CHARGED" as const,
    version: 1,
    updatedAt: "2026-07-20T00:00:00.000Z",
    traceId: "trc_01J00000000000000000000000",
  };
  const signature = await signCanonical("runtime-status-v1", status, {
    keyId: "runtime-security-fixture",
    privateKeySeed: built.runtimeSigningSeed,
  });
  let runtimeRequests = 0;
  const runtime = createServer((request, response) => {
    if (request.url === `/v1/invocations/${invocationId}/status`) {
      runtimeRequests += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ payload: status, signature }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    runtime.once("error", reject);
    runtime.listen(0, "127.0.0.1", resolve);
  });
  const address = runtime.address();
  if (!address || typeof address === "string") throw new Error("NO_TEST_PORT");
  await writeFile(
    join(home, ".agentpaykit", "bindings.json"),
    JSON.stringify({
      [invocationId]: {
        releaseId: built.releaseId,
        packageDigest: built.packageDigest,
        environment: "testnet",
        runtime: {
          url: `http://127.0.0.1:${address.port}`,
          keyId: "runtime-security-fixture",
          publicKey: built.runtimePublicKey,
        },
      },
    }),
  );

  const invokeAdapter = async (adapter: string) => {
    const instructions = await readFile(adapter, "utf8");
    expect(instructions).toContain(layout.clientBin);
    expect(instructions).toContain(`--skill ${layout.packageFile}`);
    return execute(layout.clientBin, ["status", invocationId, "--json"], {
      env: { ...process.env, AGENTPAYKIT_HOME: home },
    });
  };
  try {
    const [codex, claude] = await Promise.all([
      invokeAdapter(layout.codexEntry),
      invokeAdapter(layout.claudeEntry),
    ]);
    for (const result of [codex, claude]) {
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        command: "status",
        data: { invocationId, status: "QUEUED", chargeState: "NOT_CHARGED" },
      });
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      runtime.close((error) => (error ? reject(error) : resolve())),
    );
  }
  expect(runtimeRequests).toBe(2);
  const importableClient = join(home, "installed-client.mjs");
  await writeFile(importableClient, await readFile(layout.clientBin), {
    mode: 0o700,
  });
  const installedModule = (await import(
    `${pathToFileURL(importableClient).href}?test=${Date.now()}`
  )) as {
    BRIDGE_ASSETS: Readonly<Record<string, string>>;
    runCli(
      argv: string[],
      dependencies: Record<string, unknown>,
    ): Promise<number>;
  };
  const bridge = await LoopbackBridgeServer.start({
    staticAssets: installedModule.BRIDGE_ASSETS,
  });
  try {
    const session = bridge.createSession({
      invocationId,
      inputDigest: `sha256:${"b".repeat(64)}`,
      amount: "0.01",
      payee: `0x${"2".repeat(40)}`,
      network: "eip155:84532",
      releaseId: built.releaseId,
      dataDisclosure: "test-only metadata",
      paymentRequired: "test-only",
    });
    const javaScript = await fetch(new URL("/assets/bridge.js", session.url));
    const css = await fetch(new URL("/assets/bridge.css", session.url));
    expect(await javaScript.text()).toContain("AgentPayKit Browser Bridge");
    expect((await css.text()).length).toBeGreaterThan(1_000);
  } finally {
    await bridge.close();
  }

  let invocationCount = 0;
  const output: string[] = [];
  const dependencies = {
    platform: "darwin",
    loadSkill: async (path: string) => {
      expect(path).toBe(layout.packageFile);
      return { packageBytes: await readFile(path), release: {} };
    },
    client: {
      async invoke(skill: { packageBytes: Uint8Array }) {
        expect(Buffer.from(skill.packageBytes)).toEqual(
          Buffer.from(built.bytes),
        );
        invocationCount += 1;
        return { invocationId, status: { payload: status, signature } };
      },
      async resume(id: string) {
        expect(id).toBe(invocationId);
        return { invocationId, result: { answer: "resumed" } };
      },
    },
    spend: async () => ({}),
    receipts: async () => [],
    payInsight: async () => ({}),
    writeStdout: (line: string) => output.push(line),
    writeStderr: (line: string) => output.push(line),
  };
  for (const adapter of [layout.codexEntry, layout.claudeEntry]) {
    expect(await readFile(adapter, "utf8")).toContain(layout.packageFile);
    expect(
      await installedModule.runCli(
        [
          "invoke",
          "--skill",
          layout.packageFile,
          "--input",
          '{"query":"bounded research"}',
          "--json",
        ],
        dependencies,
      ),
    ).toBe(0);
  }
  expect(invocationCount).toBe(2);
  expect(
    await installedModule.runCli(
      ["resume", invocationId, "--json"],
      dependencies,
    ),
  ).toBe(0);
  expect(output.map((line) => JSON.parse(line).ok)).toEqual([true, true, true]);

  const spend = await execute(layout.clientBin, ["spend", "--json"], {
    env: { ...process.env, AGENTPAYKIT_HOME: home },
  });
  expect(JSON.parse(spend.stdout)).toMatchObject({
    ok: true,
    command: "spend",
    data: { limit: "20000", available: "20000" },
  });
  expect((await stat(layout.codexEntry)).ino).toBe(
    (await stat(layout.claudeEntry)).ino,
  );
  expect((await stat(layout.clientBin)).mode & 0o111).not.toBe(0);
  await expect(
    readFile(layout.configFile, "utf8").then(JSON.parse),
  ).resolves.toMatchObject({
    budget: { singleLimit: "10000", dailyLimit: "20000" },
  });
});
