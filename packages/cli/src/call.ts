import { decodePaymentResponseHeader } from "@x402/core/http";
import { isAddress, isAddressEqual, isHash, zeroHash } from "viem";

import {
  selectPaymentRequirement,
  type SelectedRequirement,
} from "./challenge";
import { CliError, asCliError, type PaymentState } from "./errors";
import type { WalletSession } from "./metamask";

const MAX_INPUT_BYTES = 32 * 1024;
const MAX_RESULT_BYTES = 1024 * 1024;
const WALLET_TIMEOUT_MS = 5 * 60 * 1000;

export interface PaymentReceipt {
  amount: string;
  currency: "USDC";
  network: string;
  payTo: string;
  transactionHash: string;
}

export interface CallResult {
  result: unknown;
  payment: PaymentReceipt | null;
}

export interface CallPaidSkillOptions {
  endpoint: string;
  input: unknown;
  maxPrice: bigint;
  timeoutSeconds: number;
}

export interface PaymentSummary {
  endpoint: string;
  amount: string;
  currency: "USDC";
  network: string;
  payTo: string;
}

export interface CallDependencies {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  connectWallet(options: {
    network: SelectedRequirement["network"];
    onUri(uri: string): void;
    timeoutMs: number;
  }): Promise<WalletSession>;
  createSignature(options: {
    provider: WalletSession["provider"];
    selectedAccount: WalletSession["selectedAccount"];
    chainId: WalletSession["chainId"];
    requirement: SelectedRequirement;
  }): Promise<string>;
  onPaymentSummary(summary: PaymentSummary): void;
  onWalletUri(uri: string): void;
}

export async function callPaidSkill(
  options: CallPaidSkillOptions,
  dependencies: CallDependencies,
): Promise<CallResult> {
  const endpoint = validateEndpoint(options.endpoint);
  if (
    options.maxPrice <= 0n ||
    !Number.isSafeInteger(options.timeoutSeconds) ||
    options.timeoutSeconds < 1 ||
    options.timeoutSeconds > 60
  ) {
    throw new CliError("INVALID_CALL_OPTIONS", "not-charged");
  }
  const body = encodeInput(options.input);
  let first: Response;
  try {
    first = await dependencies.fetch(endpoint, requestInit(body));
  } catch {
    throw new CliError("ENDPOINT_REQUEST_FAILED", "not-charged");
  }

  if (first.status >= 200 && first.status < 300) {
    try {
      return { result: await readJson(first, MAX_RESULT_BYTES), payment: null };
    } catch (error) {
      if (error instanceof CliError && error.code === "RESULT_TOO_LARGE") {
        throw new CliError("RESULT_TOO_LARGE", "not-charged");
      }
      throw new CliError("ENDPOINT_REQUEST_FAILED", "not-charged");
    }
  }
  if (first.status !== 402) {
    await discard(first);
    throw new CliError("ENDPOINT_REQUEST_FAILED", "not-charged");
  }

  const challenge = first.headers.get("PAYMENT-REQUIRED");
  await discard(first);
  if (challenge === null || challenge.length > 16 * 1024) {
    throw new CliError("INVALID_PAYMENT_REQUIRED", "not-charged");
  }
  let requirement: SelectedRequirement;
  try {
    requirement = selectPaymentRequirement({
      header: challenge,
      endpoint,
      maxPrice: options.maxPrice,
    });
  } catch (error) {
    throw asCliError(error, "INVALID_PAYMENT_REQUIRED", "not-charged");
  }

  dependencies.onPaymentSummary({
    endpoint,
    amount: formatUsdc(requirement.amount),
    currency: "USDC",
    network: requirement.network,
    payTo: requirement.payTo,
  });

  try {
    const { signature, selectedAccount } = await preparePayment(
      requirement,
      dependencies,
    );
    return await fetchAndProcessSigned(
      endpoint,
      body,
      signature,
      options.timeoutSeconds * 1000,
      dependencies.fetch,
      requirement,
      selectedAccount,
    );
  } catch (error) {
    if (error instanceof CliError) throw error;
    const safe = asCliError(error, "PAYMENT_STATE_UNKNOWN", "unknown");
    if (
      [
        "PAYMENT_REJECTED",
        "WALLET_CONFIRMATION_TIMEOUT",
        "WALLET_CONNECTION_FAILED",
        "WALLET_STATE_CHANGED",
        "INSUFFICIENT_USDC_BALANCE",
        "PAYMENT_SIGNATURE_FAILED",
      ].includes(safe.code)
    ) {
      throw new CliError(safe.code, "not-charged");
    }
    throw new CliError("PAYMENT_STATE_UNKNOWN", "unknown");
  }
}

async function preparePayment(
  requirement: SelectedRequirement,
  dependencies: CallDependencies,
): Promise<{ signature: string; selectedAccount: `0x${string}` }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new CliError("WALLET_CONFIRMATION_TIMEOUT", "not-charged")),
      WALLET_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([
      (async () => {
        const wallet = await dependencies.connectWallet({
          network: requirement.network,
          onUri: dependencies.onWalletUri,
          timeoutMs: WALLET_TIMEOUT_MS,
        });
        const signature = await dependencies.createSignature({
          provider: wallet.provider,
          selectedAccount: wallet.selectedAccount,
          chainId: wallet.chainId,
          requirement,
        });
        return { signature, selectedAccount: wallet.selectedAccount };
      })(),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function validateEndpoint(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CliError("INVALID_ENDPOINT", "not-charged");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    throw new CliError("INVALID_ENDPOINT", "not-charged");
  }
  return url.href;
}

function encodeInput(input: unknown): string {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(input);
  } catch {
    throw new CliError("INVALID_INPUT_JSON", "not-charged");
  }
  if (encoded === undefined) {
    throw new CliError("INVALID_INPUT_JSON", "not-charged");
  }
  if (Buffer.byteLength(encoded, "utf8") > MAX_INPUT_BYTES) {
    throw new CliError("INPUT_TOO_LARGE", "not-charged");
  }
  return encoded;
}

function requestInit(body: string, signature?: string): RequestInit {
  return {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      ...(signature === undefined ? {} : { "PAYMENT-SIGNATURE": signature }),
    },
    body,
  };
}

async function fetchAndProcessSigned(
  endpoint: string,
  body: string,
  signature: string,
  timeoutMs: number,
  fetcher: CallDependencies["fetch"],
  requirement: SelectedRequirement,
  selectedAccount: `0x${string}`,
): Promise<CallResult> {
  const controller = new AbortController();
  let response: Response | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      void response?.body?.cancel().catch(() => undefined);
      reject(new CliError("PAYMENT_STATE_UNKNOWN", "unknown"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        response = await fetcher(endpoint, {
          ...requestInit(body, signature),
          signal: controller.signal,
        });
        return processSignedResponse(response, requirement, selectedAccount);
      })(),
      timeout,
    ]);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("PAYMENT_STATE_UNKNOWN", "unknown");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function processSignedResponse(
  response: Response,
  requirement: SelectedRequirement,
  selectedAccount: `0x${string}`,
): Promise<CallResult> {
  const receipt = parseReceipt(
    response.headers.get("PAYMENT-RESPONSE"),
    requirement,
    selectedAccount,
  );
  if (receipt?.success === false) {
    await discard(response);
    throw new CliError("SETTLEMENT_FAILED", "not-charged");
  }
  if (response.status < 200 || response.status >= 300) {
    await discard(response);
    const state: PaymentState =
      receipt?.success === true ? "charged" : "unknown";
    throw new CliError("SKILL_EXECUTION_FAILED", state);
  }
  try {
    const result = await readJson(response, MAX_RESULT_BYTES);
    if (receipt?.success !== true || receipt.transactionHash === undefined) {
      throw new CliError("PAYMENT_STATE_UNKNOWN", "unknown");
    }
    return {
      result,
      payment: {
        amount: formatUsdc(requirement.amount),
        currency: "USDC",
        network: requirement.network,
        payTo: requirement.payTo,
        transactionHash: receipt.transactionHash,
      },
    };
  } catch (error) {
    if (error instanceof CliError && error.code === "RESULT_TOO_LARGE") {
      throw new CliError(
        "RESULT_TOO_LARGE",
        receipt?.success === true ? "charged" : "unknown",
      );
    }
    if (error instanceof CliError) throw error;
    throw new CliError(
      receipt?.success === true
        ? "SKILL_EXECUTION_FAILED"
        : "PAYMENT_STATE_UNKNOWN",
      receipt?.success === true ? "charged" : "unknown",
    );
  }
}

function parseReceipt(
  header: string | null,
  requirement: SelectedRequirement,
  selectedAccount: `0x${string}`,
): { success: boolean; transactionHash?: string } | undefined {
  if (header === null || header.length > 16 * 1024) return undefined;
  try {
    const decoded = decodePaymentResponseHeader(header);
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      Array.isArray(decoded) ||
      typeof decoded.success !== "boolean" ||
      decoded.network !== requirement.network ||
      !isOptionalString(decoded.payer) ||
      !isOptionalString(decoded.amount) ||
      !isOptionalString(decoded.errorReason) ||
      !isOptionalString(decoded.errorMessage) ||
      !isOptionalRecord(decoded.extensions) ||
      !isOptionalRecord(decoded.extra) ||
      (decoded.amount !== undefined &&
        decoded.amount !== requirement.amount.toString())
    )
      return undefined;
    if (
      typeof decoded.transaction !== "string" ||
      (decoded.payer !== undefined &&
        (typeof decoded.payer !== "string" ||
          !isAddress(decoded.payer) ||
          !isAddressEqual(decoded.payer, selectedAccount)))
    ) {
      return undefined;
    }
    if (!decoded.success) return { success: false };
    if (
      typeof decoded.payer !== "string" ||
      !isAddress(decoded.payer) ||
      !isAddressEqual(decoded.payer, selectedAccount) ||
      !isHash(decoded.transaction) ||
      decoded.transaction === zeroHash
    ) {
      return undefined;
    }
    return { success: true, transactionHash: decoded.transaction };
  } catch {
    return undefined;
  }
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalRecord(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "object" && !Array.isArray(value))
  );
}

async function readJson(response: Response, maximum: number): Promise<unknown> {
  const contentType = response.headers.get("content-type");
  if (
    contentType !== null &&
    !/^application\/json(?:\s*;|$)/i.test(contentType)
  ) {
    throw new Error("INVALID_JSON");
  }
  const length = response.headers.get("content-length");
  if (length !== null && /^\d+$/.test(length)) {
    if (length.length > 16 || BigInt(length) > BigInt(maximum)) {
      await response.body?.cancel().catch(() => undefined);
      throw new CliError("RESULT_TOO_LARGE", "unknown");
    }
  }
  if (response.body === null) throw new Error("INVALID_JSON");
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
        throw new CliError("RESULT_TOO_LARGE", "unknown");
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
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction === "" ? whole.toString() : `${whole}.${fraction}`;
}
