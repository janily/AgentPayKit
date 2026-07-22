import { describe, expect, test, vi } from "vitest";

import { runDoctorChecks } from "../src/commands/doctor";
import {
  createDefaultDependencies,
  renderTerminalQr,
} from "../src/default-dependencies";
import { CliError } from "../src/errors";
import { isDirectExecutionPath } from "../src/index";
import { runCli, type CliDependencies } from "../src/main";

function fixture(overrides: Partial<CliDependencies> = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const dependencies: CliDependencies = {
    call: {
      fetch: vi.fn(),
      connectWallet: vi.fn(),
      createSignature: vi.fn(),
      onPaymentSummary: vi.fn(),
      onWalletUri: vi.fn(),
    },
    doctor: vi.fn(async () => ({
      node: "v24.0.0",
      pnpm: "11.0.0",
      metamask: "ok",
      rpc: { "eip155:84532": "ok", "eip155:8453": "ok" },
    })),
    disconnectWallet: vi.fn(async () => undefined),
    writeStdout: (line) => stdout.push(line),
    writeStderr: (line) => stderr.push(line),
    ...overrides,
  };
  return { dependencies, stdout, stderr };
}

describe("minimal agentpay CLI", () => {
  test("production wallet callback renders a QR without printing its raw URI", () => {
    const written: string[] = [];
    const renderer = vi.fn(() => "[scannable qr]");
    const dependencies = createDefaultDependencies({
      renderQr: renderer,
      writeStderr: (value) => written.push(value),
    });
    dependencies.call.onPaymentSummary({
      endpoint: "https://skill.example/api/invoke",
      amount: "0.05",
      currency: "USDC",
      network: "eip155:84532",
      payTo: "0x1111111111111111111111111111111111111111",
    });
    dependencies.call.onWalletUri("wc:private-session-uri");

    expect(renderer).toHaveBeenCalledWith("wc:private-session-uri");
    expect(written.join("\n")).toContain(
      "Payment: 0.05 USDC on eip155:84532 to 0x1111111111111111111111111111111111111111",
    );
    expect(written.join("\n")).toContain("[scannable qr]");
    expect(written.join("\n")).not.toContain("wc:private-session-uri");
    expect(renderTerminalQr("test-session")).not.toContain("test-session");
  });

  test("recognizes the direct executable path with Windows separators and casing", () => {
    expect(
      isDirectExecutionPath(
        "C:\\Repo\\node_modules\\@agentpaykit\\cli\\dist\\index.js",
        "c:\\repo\\node_modules\\@agentpaykit\\cli\\dist\\index.js",
        "win32",
      ),
    ).toBe(true);
    expect(
      isDirectExecutionPath(
        "C:\\Repo\\dist\\other.js",
        "C:\\Repo\\dist\\index.js",
        "win32",
      ),
    ).toBe(false);
  });

  test("doctor accepts current versions and checks wallet initialization plus both Base RPCs", async () => {
    const initializeMetaMask = vi.fn(async () => undefined);
    const checkRpc = vi.fn(async () => undefined);
    await expect(
      runDoctorChecks({
        nodeVersion: "v99.0.0",
        pnpmVersion: async () => "99.0.0",
        initializeMetaMask,
        checkRpc,
      }),
    ).resolves.toMatchObject({ node: "v99.0.0", pnpm: "99.0.0" });
    expect(initializeMetaMask).toHaveBeenCalledOnce();
    expect(checkRpc).toHaveBeenCalledWith("eip155:84532");
    expect(checkRpc).toHaveBeenCalledWith("eip155:8453");
  });

  test("supports call, doctor, and wallet disconnect on any Node platform", async () => {
    const built = fixture();
    expect(await runCli(["doctor", "--json"], built.dependencies)).toBe(0);
    expect(
      await runCli(["wallet", "disconnect", "--json"], built.dependencies),
    ).toBe(0);
    expect(JSON.parse(built.stdout[0]!)).toEqual({
      ok: true,
      result: {
        node: "v24.0.0",
        pnpm: "11.0.0",
        metamask: "ok",
        rpc: { "eip155:84532": "ok", "eip155:8453": "ok" },
      },
      payment: null,
    });
    expect(built.dependencies.disconnectWallet).toHaveBeenCalledOnce();
  });

  test("sanitizes wallet disconnect failures", async () => {
    const built = fixture({
      disconnectWallet: vi.fn(async () => {
        throw new Error("wc:private-uri");
      }),
    });
    expect(
      await runCli(["wallet", "disconnect", "--json"], built.dependencies),
    ).toBe(1);
    expect(JSON.parse(built.stderr[0]!)).toMatchObject({
      error: {
        code: "WALLET_DISCONNECT_FAILED",
        paymentState: "not-charged",
      },
    });
    expect(built.stderr[0]).not.toContain("private-uri");
  });

  test.each(["invoke", "status", "resume", "spend", "release", "install"])(
    "rejects legacy command %s with exit 2 and only the new command list",
    async (command) => {
      const built = fixture();
      expect(await runCli([command, "--json"], built.dependencies)).toBe(2);
      const output = JSON.parse(built.stderr[0]!);
      expect(output.error.code).toBe("UNKNOWN_COMMAND");
      expect(JSON.stringify(output)).not.toMatch(
        /invoke|status|resume|spend|release|install/,
      );
    },
  );

  test("unknown-command human output lists only the three supported commands", async () => {
    const built = fixture();
    expect(await runCli(["invoke"], built.dependencies)).toBe(2);
    expect(built.stderr[0]).toContain("call, doctor, wallet disconnect");
    expect(built.stderr[0]).not.toMatch(/status|resume|release|install/);
  });

  test.each([
    ["call"],
    ["call", "https://skill.example", "--input-json", "{}"],
    [
      "call",
      "https://skill.example",
      "--input-json",
      "{}",
      "--input-json",
      "{}",
      "--max-price",
      "1",
    ],
    [
      "call",
      "https://skill.example",
      "--input-json",
      "{}",
      "--max-price",
      "1",
      "--wat",
    ],
    [
      "call",
      "https://skill.example",
      "--input-json",
      "{}",
      "--max-price",
      "1",
      "--timeout",
      "61",
    ],
    ["doctor", "extra"],
    ["doctor", "--json", "--json"],
    ["wallet", "disconnect", "extra"],
  ])(
    "rejects invalid argument vector %j without side effects",
    async (...argv) => {
      const built = fixture();
      expect(await runCli(argv as string[], built.dependencies)).toBe(2);
      expect(built.dependencies.doctor).not.toHaveBeenCalled();
      expect(built.dependencies.disconnectWallet).not.toHaveBeenCalled();
    },
  );

  test("emits exact call success and sanitized failure JSON", async () => {
    const success = fixture();
    success.dependencies.call.fetch = vi.fn(
      async () =>
        new Response('{"answer":42}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    expect(
      await runCli(
        [
          "call",
          "https://skill.example",
          "--input-json",
          "{}",
          "--max-price",
          "0.05",
          "--json",
        ],
        success.dependencies,
      ),
    ).toBe(0);
    expect(JSON.parse(success.stdout[0]!)).toEqual({
      ok: true,
      result: { answer: 42 },
      payment: null,
    });

    const failure = fixture({
      call: {
        ...success.dependencies.call,
        fetch: vi.fn(async () => {
          throw new CliError(
            "ENDPOINT_REQUEST_FAILED",
            "not-charged",
            "attacker secret",
          );
        }),
      },
    });
    expect(
      await runCli(
        [
          "call",
          "https://skill.example",
          "--input-json",
          "{}",
          "--max-price",
          "0.05",
          "--json",
        ],
        failure.dependencies,
      ),
    ).toBe(1);
    expect(failure.stderr[0]).not.toContain("attacker secret");
  });
});
