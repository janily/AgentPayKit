import { describe, expect, test, vi } from "vitest";

import { runCli, type CliDependencies } from "../src/main";

const status = {
  payload: {
    schemaVersion: "1",
    invocationId: "inv_01J00000000000000000000000",
    status: "QUEUED",
    chargeState: "CHARGED",
    updatedAt: "2026-07-19T12:00:00.000Z",
  },
  signature: { keyId: "runtime-1", algorithm: "Ed25519", value: "sig" },
} as const;

function fixture(overrides: Partial<CliDependencies> = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const dependencies: CliDependencies = {
    platform: "darwin",
    client: {
      invoke: vi.fn(async () => ({
        invocationId: status.payload.invocationId,
        status,
      })),
      status: vi.fn(async () => status),
      resume: vi.fn(async () => ({
        schemaVersion: "1",
        invocationId: status.payload.invocationId,
        status: "RESULT_AVAILABLE",
        resultDigest: `sha256:${"a".repeat(64)}`,
        result: { answer: 42 },
      })),
    },
    loadSkill: vi.fn(async () => ({ installed: true }) as never),
    spend: vi.fn(async () => ({
      limit: "1000000",
      spent: "10000",
      held: "5000",
      available: "985000",
    })),
    writeStdout: (line) => stdout.push(line),
    writeStderr: (line) => stderr.push(line),
    ...overrides,
  };
  return { dependencies, stdout, stderr };
}

describe("agentpay CLI contract", () => {
  test("prints a stable JSON schema for every command", async () => {
    for (const argv of [
      ["invoke", "--skill", "skill.json", "--input", '{"topic":"x"}', "--json"],
      ["status", status.payload.invocationId, "--json"],
      ["resume", status.payload.invocationId, "--json"],
      ["spend", "--json"],
    ]) {
      const built = fixture();
      expect(await runCli(argv, built.dependencies)).toBe(0);
      expect(JSON.parse(built.stdout[0]!)).toMatchObject({
        schemaVersion: "1",
        ok: true,
        command: argv[0],
      });
    }
  });

  test("human invoke output includes charge state and a recovery command", async () => {
    const built = fixture();
    await runCli(
      ["invoke", "--skill", "skill.json", "--input", "{}"],
      built.dependencies,
    );

    expect(built.stdout.join("\n")).toMatchInlineSnapshot(`
      "Invocation inv_01J00000000000000000000000 is QUEUED (CHARGED)
      Resume: agentpay resume inv_01J00000000000000000000000"
    `);
  });

  test("fails on non-macOS before reading a skill or calling the client", async () => {
    const built = fixture({ platform: "linux" });
    const exit = await runCli(
      ["invoke", "--skill", "skill.json", "--input", "{}", "--json"],
      built.dependencies,
    );

    expect(exit).toBe(1);
    expect(built.dependencies.loadSkill).not.toHaveBeenCalled();
    expect(built.dependencies.client.invoke).not.toHaveBeenCalled();
    expect(JSON.parse(built.stderr[0]!)).toMatchObject({
      schemaVersion: "1",
      ok: false,
      command: "invoke",
      error: { code: "UNSUPPORTED_PLATFORM", chargeState: "NOT_CHARGED" },
    });
  });

  test.each([
    ["WALLET_REJECTED", "NOT_CHARGED"],
    ["INVALID_RUNTIME_SIGNATURE", "NOT_CHARGED"],
    ["FAILED_NOT_CHARGED", "NOT_CHARGED"],
    ["SETTLEMENT_TIMEOUT", "SETTLEMENT_UNKNOWN"],
    ["RESULT_EXPIRED", "CHARGED"],
  ])("maps %s to %s", async (code, chargeState) => {
    const built = fixture({
      client: {
        invoke: vi.fn(async () => {
          throw Object.assign(new Error(code), { code });
        }),
        status: vi.fn(),
        resume: vi.fn(),
      },
    });
    await runCli(
      ["invoke", "--skill", "skill.json", "--input", "{}", "--json"],
      built.dependencies,
    );
    expect(JSON.parse(built.stderr[0]!)).toMatchObject({
      error: { code, chargeState },
    });
  });

  test("marks skill loading failures as not charged", async () => {
    const built = fixture({
      loadSkill: vi.fn(async () => {
        throw new Error("missing descriptor");
      }),
    });
    await runCli(
      ["invoke", "--skill", "missing.json", "--input", "{}", "--json"],
      built.dependencies,
    );
    expect(JSON.parse(built.stderr[0]!)).toMatchObject({
      error: { code: "SKILL_LOAD_FAILED", chargeState: "NOT_CHARGED" },
    });
  });

  test("reports a recoverable handle when invocation polling is interrupted", async () => {
    const error = Object.assign(new Error("INVOCATION_PENDING"), {
      code: "INVOCATION_PENDING",
      handle: { invocationId: status.payload.invocationId, status },
    });
    const built = fixture({
      client: {
        invoke: vi.fn(async () => {
          throw error;
        }),
        status: vi.fn(),
        resume: vi.fn(),
      },
    });
    expect(
      await runCli(
        ["invoke", "--skill", "skill.json", "--input", "{}"],
        built.dependencies,
      ),
    ).toBe(1);
    expect(built.stderr.join("\n")).toContain(
      `Resume: agentpay resume ${status.payload.invocationId}`,
    );
  });

  test("catches SIGINT and emits the handle once invoke returns", async () => {
    let signalHandler: (() => void) | undefined;
    const built = fixture({
      signals: {
        on: vi.fn((_signal, handler) => {
          signalHandler = handler;
        }),
        off: vi.fn(),
      },
    });
    const running = runCli(
      ["invoke", "--skill", "skill.json", "--input", "{}"],
      built.dependencies,
    );
    signalHandler?.();

    expect(await running).toBe(130);
    expect(built.stderr.join("\n")).toContain(
      `Resume: agentpay resume ${status.payload.invocationId}`,
    );
    expect(built.dependencies.signals?.off).toHaveBeenCalled();
  });
});
