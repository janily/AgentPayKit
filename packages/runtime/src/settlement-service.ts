import type { JsonValue } from "@agentpaykit/protocol";

export interface VerifiedPaymentSnapshot {
  schemaVersion: "1";
  verifiedAt?: string;
  paymentPayload: Record<string, JsonValue>;
  paymentRequirements: Record<string, JsonValue>;
  declaredExtensions?: Record<string, JsonValue>;
}

export type SettlementOutcome =
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

function evmAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

export class SettlementService {
  constructor(
    private readonly ports: {
      settler: {
        settle(snapshot: VerifiedPaymentSnapshot): Promise<{
          success: boolean;
          transaction?: unknown;
          payer?: unknown;
        }>;
      };
      chain: {
        confirm(
          transactionHash: `0x${string}`,
          network: string,
        ): Promise<{
          confirmed: boolean;
          confirmedAt?: string;
        }>;
      };
    },
  ) {}

  async settle(snapshot: VerifiedPaymentSnapshot): Promise<SettlementOutcome> {
    let settled: Awaited<ReturnType<typeof this.ports.settler.settle>>;
    try {
      settled = await this.ports.settler.settle(snapshot);
    } catch {
      return { state: "SETTLEMENT_UNKNOWN" };
    }
    if (!settled.success) {
      return { state: "NOT_CHARGED", errorCode: "SETTLEMENT_REJECTED" };
    }
    const requirements = snapshot.paymentRequirements;
    if (
      typeof settled.transaction !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(settled.transaction) ||
      !evmAddress(settled.payer) ||
      !evmAddress(requirements.payTo) ||
      !evmAddress(requirements.asset) ||
      typeof requirements.amount !== "string" ||
      (requirements.network !== "eip155:84532" &&
        requirements.network !== "eip155:8453")
    ) {
      return { state: "SETTLEMENT_UNKNOWN" };
    }
    const transactionHash = settled.transaction as `0x${string}`;
    const confirmation = await this.ports.chain.confirm(
      transactionHash,
      requirements.network,
    );
    if (!confirmation.confirmed || !confirmation.confirmedAt) {
      return { state: "SETTLEMENT_UNKNOWN" };
    }
    return {
      state: "CHARGED",
      transactionHash,
      payer: settled.payer,
      payee: requirements.payTo,
      network: requirements.network,
      asset: requirements.asset,
      amount: requirements.amount,
      confirmedAt: confirmation.confirmedAt,
    };
  }
}
