import type { SettlePaymentInput, SettlementResult } from "./types";

export type ReconciliationOutcome =
  | { state: "SETTLEMENT_UNKNOWN" }
  | { state: "NOT_CHARGED"; errorCode: string }
  | {
      state: "CHARGED";
      transactionHash: `0x${string}`;
      payer: `0x${string}`;
      payee: `0x${string}`;
      network: "eip155:84532" | "eip155:8453";
      asset: `0x${string}`;
      amount: string;
      confirmedAt: string;
    };

interface Authorization {
  from: `0x${string}`;
  nonce: `0x${string}`;
  validBefore: number;
}

function evmAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function transactionHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function authorization(snapshot: SettlePaymentInput): Authorization {
  const payload = snapshot.paymentPayload.payload;
  const value =
    typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? payload.authorization
      : undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("INVALID_EIP3009_AUTHORIZATION");
  }
  if (
    !evmAddress(value.from) ||
    typeof value.nonce !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(value.nonce) ||
    typeof value.validBefore !== "string" ||
    !/^[0-9]+$/.test(value.validBefore)
  ) {
    throw new Error("INVALID_EIP3009_AUTHORIZATION");
  }
  return {
    from: value.from,
    nonce: value.nonce as `0x${string}`,
    validBefore: Number(value.validBefore),
  };
}

function charged(
  snapshot: SettlePaymentInput,
  auth: Authorization,
  txHash: `0x${string}`,
  confirmedAt: string,
): ReconciliationOutcome {
  const requirements = snapshot.paymentRequirements;
  if (
    !evmAddress(requirements.payTo) ||
    !evmAddress(requirements.asset) ||
    typeof requirements.amount !== "string" ||
    (requirements.network !== "eip155:84532" &&
      requirements.network !== "eip155:8453")
  ) {
    return { state: "SETTLEMENT_UNKNOWN" };
  }
  return {
    state: "CHARGED",
    transactionHash: txHash,
    payer: auth.from,
    payee: requirements.payTo,
    network: requirements.network,
    asset: requirements.asset,
    amount: requirements.amount,
    confirmedAt,
  };
}

export class PaymentReconciler {
  constructor(
    private readonly ports: {
      chain: {
        receipt(
          transactionHash: `0x${string}`,
          network: string,
        ): Promise<{
          state: "confirmed" | "reverted" | "not_found";
          confirmedAt?: string;
        }>;
        authorizationUsed(input: {
          network: string;
          asset: string;
          authorizer: `0x${string}`;
          nonce: `0x${string}`;
        }): Promise<
          | { used: false }
          | {
              used: true;
              transactionHash: `0x${string}`;
              confirmedAt: string;
            }
        >;
      };
      settler: { settle(input: SettlePaymentInput): Promise<SettlementResult> };
      nowSeconds(): number;
    },
  ) {}

  async reconcile(input: {
    snapshot: SettlePaymentInput;
    transactionHash?: string;
  }): Promise<ReconciliationOutcome> {
    const auth = authorization(input.snapshot);
    const network = input.snapshot.paymentRequirements.network;
    if (input.transactionHash) {
      if (!transactionHash(input.transactionHash)) {
        return { state: "SETTLEMENT_UNKNOWN" };
      }
      const receipt = await this.ports.chain.receipt(
        input.transactionHash,
        String(network),
      );
      if (receipt.state === "reverted") {
        return { state: "NOT_CHARGED", errorCode: "SETTLEMENT_REVERTED" };
      }
      if (receipt.state !== "confirmed" || !receipt.confirmedAt) {
        return { state: "SETTLEMENT_UNKNOWN" };
      }
      return charged(
        input.snapshot,
        auth,
        input.transactionHash,
        receipt.confirmedAt,
      );
    }

    const used = await this.ports.chain.authorizationUsed({
      network: String(network),
      asset: String(input.snapshot.paymentRequirements.asset),
      authorizer: auth.from,
      nonce: auth.nonce,
    });
    if (used.used) {
      return charged(
        input.snapshot,
        auth,
        used.transactionHash,
        used.confirmedAt,
      );
    }
    if (this.ports.nowSeconds() >= auth.validBefore) {
      return { state: "NOT_CHARGED", errorCode: "AUTHORIZATION_EXPIRED" };
    }

    let settlement: SettlementResult;
    try {
      settlement = await this.ports.settler.settle(input.snapshot);
    } catch {
      return { state: "SETTLEMENT_UNKNOWN" };
    }
    if (!settlement.success || !transactionHash(settlement.transaction)) {
      return { state: "SETTLEMENT_UNKNOWN" };
    }
    const receipt = await this.ports.chain.receipt(
      settlement.transaction,
      String(network),
    );
    if (receipt.state !== "confirmed" || !receipt.confirmedAt) {
      return { state: "SETTLEMENT_UNKNOWN" };
    }
    return charged(
      input.snapshot,
      auth,
      settlement.transaction,
      receipt.confirmedAt,
    );
  }
}
