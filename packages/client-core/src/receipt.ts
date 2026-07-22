import { decodePaymentResponseHeader } from "@x402/core/http";
import { isAddress, isAddressEqual, isHash, zeroHash } from "viem";

import type { SelectedRequirement } from "./types.js";

export function parseReceipt(
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
