import { CliError, type PaymentState } from "./errors.js";
import { parseReceipt } from "./receipt.js";
import { readJson, requestInit } from "./prepare.js";
import {
  MAX_RESULT_BYTES,
  type CallResult,
  type FetchDependency,
  type PreparedPaidCall,
} from "./types.js";

export interface ExecutePreparedCallOptions {
  preparedCall: PreparedPaidCall;
  signature: string;
  payer: `0x${string}`;
  timeoutMs: number;
}

export async function executePreparedCall(
  options: ExecutePreparedCallOptions,
  dependencies: FetchDependency,
): Promise<CallResult> {
  const controller = new AbortController();
  let response: Response | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      void response?.body?.cancel().catch(() => undefined);
      reject(new CliError("PAYMENT_STATE_UNKNOWN", "unknown"));
    }, options.timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        response = await dependencies.fetch(options.preparedCall.endpoint, {
          ...requestInit(options.preparedCall.body, options.signature),
          signal: controller.signal,
        });
        return processSignedResponse(
          response,
          options.preparedCall,
          options.payer,
        );
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
  preparedCall: PreparedPaidCall,
  selectedAccount: `0x${string}`,
): Promise<CallResult> {
  const receipt = parseReceipt(
    response.headers.get("PAYMENT-RESPONSE"),
    preparedCall.requirement,
    selectedAccount,
  );
  if (receipt?.success === false) {
    await response.body?.cancel().catch(() => undefined);
    throw new CliError("SETTLEMENT_FAILED", "not-charged");
  }
  if (response.status < 200 || response.status >= 300) {
    await response.body?.cancel().catch(() => undefined);
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
        amount: preparedCall.paymentSummary.amount,
        currency: "USDC",
        network: preparedCall.requirement.network,
        payTo: preparedCall.requirement.payTo,
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
