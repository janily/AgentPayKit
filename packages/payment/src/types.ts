export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface VerifyPaymentInput {
  paymentHeader: string;
  method: string;
  url: string;
}

export interface VerifiedPayment {
  paymentPayload: JsonObject;
  paymentRequirements: JsonObject;
  declaredExtensions?: JsonObject;
}

export interface SettlePaymentInput extends VerifiedPayment {}

export interface SettlementResult extends JsonObject {
  success: boolean;
}

export interface ReconcilePaymentInput {
  paymentPayload: JsonObject;
  paymentRequirements: JsonObject;
  transaction?: string;
}

export type SettlementState = "CHARGED" | "NOT_CHARGED" | "SETTLEMENT_UNKNOWN";

export interface PaymentVerifier {
  verify(input: VerifyPaymentInput): Promise<VerifiedPayment>;
}

export interface PaymentSettler {
  settle(input: SettlePaymentInput): Promise<SettlementResult>;
  reconcile(input: ReconcilePaymentInput): Promise<SettlementState>;
}
