import type { ChargeState, InvocationStatus } from "@agentpaykit/protocol";

import { assertTransition } from "./state-machine";

type D1Value = null | number | string | ArrayBuffer | Uint8Array;

interface D1Result {
  success: boolean;
  meta: { changes?: number };
}

interface D1PreparedStatement {
  bind(...values: D1Value[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

export interface D1DatabasePort {
  prepare(query: string): D1PreparedStatement;
}

export interface InvocationRecord {
  id: string;
  quoteId: string;
  releaseId: string;
  inputDigest: string;
  requestFingerprint: string;
  status: InvocationStatus;
  chargeState: ChargeState;
  version: number;
  inputBlobKey: string;
  inputBlobDigest: string;
  paymentBlobKey: string;
  paymentBlobDigest: string;
  candidateResultBlobKey?: string;
  resultBlobKey?: string;
  resultDigest?: string;
  transactionHash?: string;
  errorCode?: string;
  traceId: string;
  createdAt: string;
  updatedAt: string;
}

interface InvocationRow {
  id: string;
  quote_id: string;
  release_id: string;
  input_digest: string;
  request_fingerprint: string;
  status: InvocationStatus;
  charge_state: ChargeState;
  version: number;
  input_blob_key: string;
  input_blob_digest: string;
  payment_blob_key: string;
  payment_blob_digest: string;
  candidate_result_blob_key: string | null;
  result_blob_key: string | null;
  result_digest: string | null;
  transaction_hash: string | null;
  error_code: string | null;
  trace_id: string;
  created_at: string;
  updated_at: string;
}

export interface NewRelease {
  id: string;
  packageDigest: string;
  publisherId: string;
  network: string;
  environment: "testnet" | "mainnet";
  amount: string;
  asset: string;
  payee: string;
  now: string;
}

export interface ReleaseRecord {
  id: string;
  packageDigest: string;
  publisherId: string;
  network: "eip155:84532" | "eip155:8453";
  environment: "testnet" | "mainnet";
  amount: string;
  asset: `0x${string}`;
  payee: `0x${string}`;
  createdAt: string;
}

export interface NewQuote {
  id: string;
  invocationId: string;
  releaseId: string;
  inputDigest: string;
  environment: "testnet" | "mainnet";
  expiresAt: string;
  now: string;
}

export interface QuoteRecord {
  id: string;
  invocationId: string;
  releaseId: string;
  inputDigest: string;
  environment: "testnet" | "mainnet";
  expiresAt: string;
  createdAt: string;
}

export interface NewInvocation {
  id: string;
  quoteId: string;
  releaseId: string;
  inputDigest: string;
  requestFingerprint: string;
  inputBlobKey: string;
  inputBlobDigest: string;
  paymentBlobKey: string;
  paymentBlobDigest: string;
  traceId: string;
  now: string;
}

export interface TransitionInvocation {
  id: string;
  from: InvocationStatus;
  to: InvocationStatus;
  expectedVersion: number;
  now: string;
  chargeState?: ChargeState;
  candidateResultBlobKey?: string;
  resultBlobKey?: string;
  resultDigest?: string;
  transactionHash?: string;
  errorCode?: string;
}

export class InvocationBindingConflictError extends Error {
  readonly code = "INVOCATION_BINDING_CONFLICT";

  constructor(invocationId: string) {
    super(`Invocation ${invocationId} is already bound to a different request`);
    this.name = "InvocationBindingConflictError";
  }
}

function optional<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

function invocationRecord(row: InvocationRow): InvocationRecord {
  return {
    id: row.id,
    quoteId: row.quote_id,
    releaseId: row.release_id,
    inputDigest: row.input_digest,
    requestFingerprint: row.request_fingerprint,
    status: row.status,
    chargeState: row.charge_state,
    version: row.version,
    inputBlobKey: row.input_blob_key,
    inputBlobDigest: row.input_blob_digest,
    paymentBlobKey: row.payment_blob_key,
    paymentBlobDigest: row.payment_blob_digest,
    candidateResultBlobKey: optional(row.candidate_result_blob_key),
    resultBlobKey: optional(row.result_blob_key),
    resultDigest: optional(row.result_digest),
    transactionHash: optional(row.transaction_hash),
    errorCode: optional(row.error_code),
    traceId: row.trace_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class D1InvocationRepository {
  constructor(private readonly database: D1DatabasePort) {}

  async createRelease(release: NewRelease): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO releases
          (id, package_digest, publisher_id, network, environment, amount, asset, payee, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        release.id,
        release.packageDigest,
        release.publisherId,
        release.network,
        release.environment,
        release.amount,
        release.asset,
        release.payee,
        release.now,
      )
      .run();
  }

  async getRelease(id: string): Promise<ReleaseRecord | undefined> {
    const row = await this.database
      .prepare("SELECT * FROM releases WHERE id = ?")
      .bind(id)
      .first<{
        id: string;
        package_digest: string;
        publisher_id: string;
        network: "eip155:84532" | "eip155:8453";
        environment: "testnet" | "mainnet";
        amount: string;
        asset: `0x${string}`;
        payee: `0x${string}`;
        created_at: string;
      }>();
    return row
      ? {
          id: row.id,
          packageDigest: row.package_digest,
          publisherId: row.publisher_id,
          network: row.network,
          environment: row.environment,
          amount: row.amount,
          asset: row.asset,
          payee: row.payee,
          createdAt: row.created_at,
        }
      : undefined;
  }

  async createQuote(quote: NewQuote): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO quotes
          (id, invocation_id, release_id, input_digest, environment, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        quote.id,
        quote.invocationId,
        quote.releaseId,
        quote.inputDigest,
        quote.environment,
        quote.expiresAt,
        quote.now,
      )
      .run();
  }

  async getQuote(id: string): Promise<QuoteRecord | undefined> {
    const row = await this.database
      .prepare("SELECT * FROM quotes WHERE id = ?")
      .bind(id)
      .first<{
        id: string;
        invocation_id: string;
        release_id: string;
        input_digest: string;
        environment: "testnet" | "mainnet";
        expires_at: string;
        created_at: string;
      }>();
    return row
      ? {
          id: row.id,
          invocationId: row.invocation_id,
          releaseId: row.release_id,
          inputDigest: row.input_digest,
          environment: row.environment,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
        }
      : undefined;
  }

  async createOrGetInvocation(
    invocation: NewInvocation,
  ): Promise<{ kind: "created" | "existing"; invocation: InvocationRecord }> {
    const result = await this.database
      .prepare(
        `INSERT OR IGNORE INTO invocations
          (id, quote_id, release_id, input_digest, request_fingerprint, status, charge_state,
           version, input_blob_key, input_blob_digest, payment_blob_key, payment_blob_digest,
           trace_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'PAYMENT_VERIFIED', 'NOT_CHARGED', 0, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        invocation.id,
        invocation.quoteId,
        invocation.releaseId,
        invocation.inputDigest,
        invocation.requestFingerprint,
        invocation.inputBlobKey,
        invocation.inputBlobDigest,
        invocation.paymentBlobKey,
        invocation.paymentBlobDigest,
        invocation.traceId,
        invocation.now,
        invocation.now,
      )
      .run();
    const stored = await this.getInvocation(invocation.id);
    if (
      !stored ||
      stored.requestFingerprint !== invocation.requestFingerprint
    ) {
      throw new InvocationBindingConflictError(invocation.id);
    }
    return {
      kind: result.meta.changes === 1 ? "created" : "existing",
      invocation: stored,
    };
  }

  async getInvocation(id: string): Promise<InvocationRecord | undefined> {
    const row = await this.database
      .prepare("SELECT * FROM invocations WHERE id = ?")
      .bind(id)
      .first<InvocationRow>();
    return row ? invocationRecord(row) : undefined;
  }

  async transition(input: TransitionInvocation): Promise<boolean> {
    assertTransition(input.from, input.to);
    const result = await this.database
      .prepare(
        `UPDATE invocations SET
           status = ?,
           charge_state = COALESCE(?, charge_state),
           candidate_result_blob_key = COALESCE(?, candidate_result_blob_key),
           result_blob_key = COALESCE(?, result_blob_key),
           result_digest = COALESCE(?, result_digest),
           transaction_hash = COALESCE(?, transaction_hash),
           error_code = COALESCE(?, error_code),
           version = version + 1,
           updated_at = ?
         WHERE id = ? AND status = ? AND version = ?`,
      )
      .bind(
        input.to,
        input.chargeState ?? null,
        input.candidateResultBlobKey ?? null,
        input.resultBlobKey ?? null,
        input.resultDigest ?? null,
        input.transactionHash ?? null,
        input.errorCode ?? null,
        input.now,
        input.id,
        input.from,
        input.expectedVersion,
      )
      .run();
    return result.meta.changes === 1;
  }
}
