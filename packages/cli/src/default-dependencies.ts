import { execFile } from "node:child_process";
import { promisify } from "node:util";

import qrcode from "qrcode-terminal";

import type { CliDependencies } from "./main";
import { runDoctorChecks } from "./commands/doctor";
import { CliError } from "./errors";
import {
  connectMetaMask,
  disconnectMetaMaskClient,
  initializeMetaMaskClient,
} from "./metamask";
import { NETWORKS, type SupportedNetwork } from "./networks";
import { createPaymentSignature } from "./signer";

const execute = promisify(execFile);

export interface DefaultDependencyOptions {
  renderQr?: (uri: string) => string;
  writeStderr?: (text: string) => void;
}

export function renderTerminalQr(uri: string): string {
  let rendered = "";
  qrcode.generate(uri, { small: true }, (value) => {
    rendered = value;
  });
  return rendered;
}

export function createDefaultDependencies(
  options: DefaultDependencyOptions = {},
): CliDependencies {
  const writeStderr =
    options.writeStderr ?? ((text: string) => process.stderr.write(text));
  const renderQr = options.renderQr ?? renderTerminalQr;
  return {
    call: {
      fetch: globalThis.fetch,
      connectWallet: connectMetaMask,
      createSignature: createPaymentSignature,
      onPaymentSummary: (summary) => {
        writeStderr(
          `Payment: ${summary.amount} USDC on ${summary.network} to ${summary.payTo}\n`,
        );
      },
      onWalletUri: (uri) => {
        writeStderr(
          `Scan this QR code with MetaMask Mobile:\n${renderQr(uri)}\n`,
        );
      },
    },
    doctor: async () => {
      try {
        return await runDoctorChecks({
          nodeVersion: process.version,
          pnpmVersion: async () =>
            (
              await execute("pnpm", ["--version"], { timeout: 5_000 })
            ).stdout.trim(),
          initializeMetaMask: initializeMetaMaskClient,
          checkRpc,
        });
      } catch {
        throw new CliError("DOCTOR_CHECK_FAILED", "not-charged");
      }
    },
    disconnectWallet: disconnectMetaMaskClient,
    writeStdout: (line) => process.stdout.write(`${line}\n`),
    writeStderr: (line) => writeStderr(`${line}\n`),
  };
}

async function checkRpc(network: SupportedNetwork): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(NETWORKS[network].rpcUrl, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
      signal: controller.signal,
    });
    const text = await readBoundedText(response, 16 * 1024);
    const value = JSON.parse(text) as { result?: unknown };
    if (!response.ok || value.result !== NETWORKS[network].chainId) {
      throw new Error("RPC_UNAVAILABLE");
    }
  } finally {
    clearTimeout(timer);
  }
}

async function readBoundedText(
  response: Response,
  maximum: number,
): Promise<string> {
  if (response.body === null) throw new Error("RPC_UNAVAILABLE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel().catch(() => undefined);
        throw new Error("RPC_UNAVAILABLE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
