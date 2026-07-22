import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { isAddress, isAddressEqual, zeroAddress } from "viem";

import { MAX_UINT256, isSupportedNetwork, USDC_ASSETS } from "./types.js";
import type { SelectedRequirement } from "./types.js";

const ATOMIC_AMOUNT = /^[1-9][0-9]{0,77}$/;

export interface SelectPaymentRequirementOptions {
  header: string;
  endpoint: string;
  maxPrice: bigint;
}

interface Candidate {
  network: SelectedRequirement["network"];
  asset: string;
  amount: bigint;
  payTo: string;
}

interface ValidatedRequirement {
  scheme: string;
  network: string;
  asset: `0x${string}`;
  amount: bigint;
  payTo: `0x${string}`;
}

export function selectPaymentRequirement({
  header,
  endpoint,
  maxPrice,
}: SelectPaymentRequirementOptions): SelectedRequirement {
  if (maxPrice <= 0n || maxPrice > MAX_UINT256) {
    throw new Error("INVALID_PAYMENT_REQUIRED");
  }

  let decoded: unknown;
  try {
    decoded = decodePaymentRequiredHeader(header);
  } catch {
    throw new Error("INVALID_PAYMENT_REQUIRED");
  }

  if (
    !isRecord(decoded) ||
    decoded.x402Version !== 2 ||
    !isRecord(decoded.resource) ||
    typeof decoded.resource.url !== "string" ||
    !Array.isArray(decoded.accepts)
  ) {
    throw new Error("INVALID_PAYMENT_REQUIRED");
  }

  let resourceUrl: string;
  let endpointUrl: string;
  try {
    resourceUrl = new URL(decoded.resource.url).href;
    endpointUrl = new URL(endpoint).href;
  } catch {
    throw new Error("INVALID_PAYMENT_REQUIRED");
  }

  if (resourceUrl !== endpointUrl) {
    throw new Error("INVALID_PAYMENT_REQUIRED");
  }

  const candidates: Candidate[] = [];
  let hasMalformedCandidate = false;

  for (const value of decoded.accepts) {
    const requirement = validateRequirement(value);
    if (requirement === undefined) {
      hasMalformedCandidate = true;
      continue;
    }

    if (
      requirement.scheme !== "exact" ||
      !isSupportedNetwork(requirement.network)
    ) {
      continue;
    }

    const expectedAsset = USDC_ASSETS[requirement.network];
    if (!isAddressEqual(requirement.asset, expectedAsset)) {
      continue;
    }

    candidates.push({
      network: requirement.network,
      asset: requirement.asset,
      amount: requirement.amount,
      payTo: requirement.payTo,
    });
  }

  if (hasMalformedCandidate) {
    throw new Error("INVALID_PAYMENT_REQUIRED");
  }

  if (candidates.length > 1) {
    throw new Error("INVALID_PAYMENT_REQUIRED");
  }

  const candidate = candidates[0];
  if (candidate === undefined) {
    throw new Error("UNSUPPORTED_PAYMENT_REQUIREMENT");
  }

  if (candidate.amount > maxPrice) {
    throw new Error("PRICE_EXCEEDS_MAXIMUM");
  }

  return {
    ...candidate,
    resourceUrl,
    paymentRequired: decoded as PaymentRequired,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateRequirement(value: unknown): ValidatedRequirement | undefined {
  if (
    !isRecord(value) ||
    typeof value.scheme !== "string" ||
    value.scheme === "" ||
    typeof value.network !== "string" ||
    value.network.length < 3 ||
    !value.network.includes(":") ||
    typeof value.asset !== "string" ||
    !isAddress(value.asset) ||
    typeof value.amount !== "string" ||
    !ATOMIC_AMOUNT.test(value.amount) ||
    typeof value.payTo !== "string" ||
    !isAddress(value.payTo) ||
    isAddressEqual(value.payTo, zeroAddress) ||
    typeof value.maxTimeoutSeconds !== "number" ||
    !Number.isFinite(value.maxTimeoutSeconds) ||
    value.maxTimeoutSeconds <= 0 ||
    !isOptionalRecord(value.extra)
  ) {
    return undefined;
  }

  const amount = BigInt(value.amount);
  if (amount > MAX_UINT256) {
    return undefined;
  }

  return {
    scheme: value.scheme,
    network: value.network,
    asset: value.asset,
    amount,
    payTo: value.payTo,
  };
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || value === null || isRecord(value);
}
