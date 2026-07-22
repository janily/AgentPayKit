import { asCliError, CliError } from "./errors.js";
import { selectPaymentRequirement } from "./challenge.js";
import {
  MAX_INPUT_BYTES,
  MAX_RESULT_BYTES,
  type FetchDependency,
  type PreparePaidCallResult,
} from "./types.js";

export interface PreparePaidCallOptions {
  endpoint: string;
  input: unknown;
  maxPrice: bigint;
}

export async function preparePaidCall(
  options: PreparePaidCallOptions,
  dependencies: FetchDependency,
): Promise<PreparePaidCallResult> {
  const endpoint = validateEndpoint(options.endpoint);
  if (options.maxPrice <= 0n) {
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
      return {
        kind: "free",
        result: {
          result: await readJson(first, MAX_RESULT_BYTES),
          payment: null,
        },
      };
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

  try {
    const requirement = selectPaymentRequirement({
      header: challenge,
      endpoint,
      maxPrice: options.maxPrice,
    });
    return {
      kind: "payment-required",
      preparedCall: {
        endpoint,
        body,
        requirement,
        paymentSummary: {
          endpoint,
          amount: formatUsdc(requirement.amount),
          currency: "USDC",
          network: requirement.network,
          payTo: requirement.payTo,
        },
      },
    };
  } catch (error) {
    throw asCliError(error, "INVALID_PAYMENT_REQUIRED", "not-charged");
  }
}

export function validateEndpoint(raw: string): string {
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

export function encodeInput(input: unknown): string {
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

export function requestInit(body: string, signature?: string): RequestInit {
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

export async function readJson(
  response: Response,
  maximum: number,
): Promise<unknown> {
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

export async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

export function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction === "" ? whole.toString() : `${whole}.${fraction}`;
}
