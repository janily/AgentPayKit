import type {
  PaymentSettler,
  PaymentVerifier,
  ReconcilePaymentInput,
  SettlePaymentInput,
  SettlementState,
  VerifyPaymentInput,
  VerifiedPayment,
} from "@agentpaykit/payment";

import { FIXTURE_PAYMENT_PAYLOAD } from "./fixtures";
import type { FacilitatorFault } from "./faults";

export class FakeFacilitator implements PaymentVerifier, PaymentSettler {
  settleCount = 0;

  constructor(private readonly options: { fault?: FacilitatorFault } = {}) {}

  async verify(input: VerifyPaymentInput): Promise<VerifiedPayment> {
    if (this.options.fault === "verify-reject") {
      throw new Error("VERIFY_REJECTED");
    }
    if (!input.paymentHeader.startsWith("test-only:")) {
      throw new Error("REAL_CREDENTIALS_FORBIDDEN");
    }
    return {
      paymentPayload: FIXTURE_PAYMENT_PAYLOAD,
      paymentRequirements: {
        schemaVersion: "test-fixture-v1",
        amount: "10000",
      },
    };
  }

  async settle(_input: SettlePaymentInput) {
    this.settleCount += 1;
    if (this.options.fault === "settle-timeout") {
      throw new Error("SETTLE_TIMEOUT");
    }
    if (this.options.fault === "settle-revert") {
      throw new Error("SETTLE_REVERTED");
    }
    return {
      success: true,
      transaction: `0x${"5".repeat(64)}`,
    };
  }

  async reconcile(_input: ReconcilePaymentInput): Promise<SettlementState> {
    return this.settleCount > 0 ? "CHARGED" : "NOT_CHARGED";
  }
}
