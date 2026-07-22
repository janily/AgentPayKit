import {
  asCliError,
  CliError,
  executePreparedCall,
  preparePaidCall,
  type CallResult,
  type PaymentReceipt,
  type PaymentSummary,
  type SelectedRequirement,
} from "@agentpaykit/client-core";

import type { WalletSession } from "./metamask";

const WALLET_TIMEOUT_MS = 5 * 60 * 1000;

export type { CallResult, PaymentReceipt, PaymentSummary };

export interface CallPaidSkillOptions {
  endpoint: string;
  input: unknown;
  maxPrice: bigint;
  timeoutSeconds: number;
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
  if (
    !Number.isSafeInteger(options.timeoutSeconds) ||
    options.timeoutSeconds < 1 ||
    options.timeoutSeconds > 60
  ) {
    throw new CliError("INVALID_CALL_OPTIONS", "not-charged");
  }

  const prepared = await preparePaidCall(options, dependencies);
  if (prepared.kind === "free") return prepared.result;

  dependencies.onPaymentSummary(prepared.preparedCall.paymentSummary);

  try {
    const { signature, selectedAccount } = await preparePayment(
      prepared.preparedCall.requirement,
      dependencies,
    );
    return await executePreparedCall(
      {
        preparedCall: prepared.preparedCall,
        signature,
        payer: selectedAccount,
        timeoutMs: options.timeoutSeconds * 1000,
      },
      dependencies,
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
