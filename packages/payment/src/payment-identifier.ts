import { decodePaymentSignatureHeader } from "@x402/core/http";
import { extractAndValidatePaymentIdentifier } from "@x402/extensions/payment-identifier";

export function readOfficialPaymentIdentifier(
  paymentHeader: string,
): string | null {
  try {
    const paymentPayload = decodePaymentSignatureHeader(paymentHeader);
    const { id, validation } =
      extractAndValidatePaymentIdentifier(paymentPayload);
    return validation.valid ? id : null;
  } catch {
    return null;
  }
}
