import { isSupportedNetwork, type SupportedNetwork } from "./networks";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ATOMIC_AMOUNT = /^(?:0|[1-9][0-9]*)$/;

export interface PaymentConfigInput {
  network: unknown;
  amount: unknown;
  asset: unknown;
  payee: unknown;
  facilitatorUrl: unknown;
}

export interface PaymentConfig {
  network: SupportedNetwork;
  amount: string;
  asset: `0x${string}`;
  payee: `0x${string}`;
  facilitatorUrl: string;
}

export function parsePaymentConfig(input: PaymentConfigInput): PaymentConfig {
  if (typeof input.network !== "string" || !isSupportedNetwork(input.network)) {
    throw new Error(
      "network must be Base Sepolia or Base Mainnet in CAIP-2 form",
    );
  }
  if (typeof input.amount !== "string" || !ATOMIC_AMOUNT.test(input.amount)) {
    throw new Error("amount must be a decimal string in atomic USDC units");
  }
  if (typeof input.asset !== "string" || !EVM_ADDRESS.test(input.asset)) {
    throw new Error("asset must be a validated EVM address");
  }
  if (typeof input.payee !== "string" || !EVM_ADDRESS.test(input.payee)) {
    throw new Error("payee must be a validated EVM address");
  }
  if (typeof input.facilitatorUrl !== "string") {
    throw new Error("facilitatorUrl must be an HTTPS URL");
  }
  const facilitatorUrl = new URL(input.facilitatorUrl);
  if (facilitatorUrl.protocol !== "https:") {
    throw new Error("facilitatorUrl must be an HTTPS URL");
  }

  return {
    network: input.network,
    amount: input.amount,
    asset: input.asset as `0x${string}`,
    payee: input.payee as `0x${string}`,
    facilitatorUrl: facilitatorUrl.toString().replace(/\/$/, ""),
  };
}
