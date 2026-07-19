import {
  parseInputDigest,
  parseInvocationId,
  parseQuoteId,
  parseReleaseId,
  parseTraceId,
  type CanonicalSignature,
  type QuoteEnvelope,
  type ReceiptEnvelope,
  type SignedEnvelope,
  type StatusEnvelope,
} from "@agentpaykit/protocol";
import type { JsonObject } from "@agentpaykit/payment";

const signature = (keyId: string): CanonicalSignature => ({
  algorithm: "Ed25519",
  keyId,
  value: "A".repeat(86),
});

const invocationId = parseInvocationId("inv_00000000000000000000000001");
const releaseId = parseReleaseId(`rel_${"1".repeat(64)}`);
const inputDigest = parseInputDigest(`sha256:${"2".repeat(64)}`);

export const FIXTURE_RELEASE = Object.freeze({
  payload: Object.freeze({
    schemaVersion: "1" as const,
    releaseId,
    packageDigest: `sha256:${"3".repeat(64)}`,
    environment: "testnet" as const,
    network: "eip155:84532" as const,
    publisher: `0x${"1".repeat(40)}` as `0x${string}`,
    payee: `0x${"2".repeat(40)}` as `0x${string}`,
    amount: "10000",
    asset: `0x${"3".repeat(40)}` as `0x${string}`,
    issuedAt: "2026-01-02T03:04:05.000Z",
    expiresAt: "2027-01-02T03:04:05.000Z",
  }),
  signature: signature("publisher.fixture.v1"),
});

const quote: QuoteEnvelope = {
  schemaVersion: "1",
  quoteId: parseQuoteId("qte_00000000000000000000000001"),
  invocationId,
  releaseId,
  inputDigest,
  environment: "testnet",
  network: "eip155:84532",
  amount: "10000",
  asset: `0x${"3".repeat(40)}`,
  payee: `0x${"2".repeat(40)}`,
  paymentIdentifier: invocationId,
  issuedAt: "2026-01-02T03:04:05.000Z",
  expiresAt: "2026-01-02T03:09:05.000Z",
};

export const FIXTURE_QUOTE: SignedEnvelope<QuoteEnvelope> = Object.freeze({
  payload: Object.freeze(quote),
  signature: signature("runtime.fixture.v1"),
});

export const FIXTURE_PAYMENT_PAYLOAD: JsonObject = Object.freeze({
  schemaVersion: "test-fixture-v1",
  testCredential: true,
  warning: "NOT_A_REAL_PAYMENT_CREDENTIAL",
  invocationId,
  authorization: `test-only:${"4".repeat(32)}`,
});

export const FIXTURE_PAYMENT_HEADER = `test-only:${btoa(
  JSON.stringify(FIXTURE_PAYMENT_PAYLOAD),
)}`;

const status: StatusEnvelope = {
  schemaVersion: "1",
  invocationId,
  status: "RESULT_AVAILABLE",
  chargeState: "CHARGED",
  version: 6,
  updatedAt: "2026-01-02T03:04:09.000Z",
  traceId: parseTraceId("trc_00000000000000000000000001"),
};

export const FIXTURE_STATUS: SignedEnvelope<StatusEnvelope> = Object.freeze({
  payload: Object.freeze(status),
  signature: signature("runtime.fixture.v1"),
});

const receipt: ReceiptEnvelope = {
  schemaVersion: "1",
  invocationId,
  releaseId,
  inputDigest,
  payer: `0x${"4".repeat(40)}`,
  payee: `0x${"2".repeat(40)}`,
  network: "eip155:84532",
  asset: `0x${"3".repeat(40)}`,
  amount: "10000",
  transactionHash: `0x${"5".repeat(64)}`,
  executionStartedAt: "2026-01-02T03:04:06.000Z",
  executedAt: "2026-01-02T03:04:08.000Z",
  settledAt: "2026-01-02T03:04:09.000Z",
  resultDigest: `sha256:${"6".repeat(64)}`,
};

export const FIXTURE_RECEIPT: SignedEnvelope<ReceiptEnvelope> = Object.freeze({
  payload: Object.freeze(receipt),
  signature: signature("runtime.fixture.v1"),
});
