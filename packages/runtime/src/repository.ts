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
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
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
  executionStartedAt?: string;
  executedAt?: string;
  settledAt?: string;
  resultExpiresAt?: string;
  inputDeletedAt?: string;
  metadataExpiresAt?: string;
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
  execution_started_at: string | null;
  executed_at: string | null;
  settled_at: string | null;
  result_expires_at: string | null;
  input_deleted_at: string | null;
  metadata_expires_at: string | null;
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
  maximumExecutionMs: number;
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
  maximumExecutionMs: number;
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
  executionStartedAt?: string;
  executedAt?: string;
  settledAt?: string;
  resultExpiresAt?: string;
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
    executionStartedAt: optional(row.execution_started_at),
    executedAt: optional(row.executed_at),
    settledAt: optional(row.settled_at),
    resultExpiresAt: optional(row.result_expires_at),
    inputDeletedAt: optional(row.input_deleted_at),
    metadataExpiresAt: optional(row.metadata_expires_at),
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
          (id, package_digest, publisher_id, network, environment, amount, asset, payee,
           maximum_execution_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        release.maximumExecutionMs,
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
        maximum_execution_ms: number;
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
          maximumExecutionMs: row.maximum_execution_ms,
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
           trace_id, created_at, updated_at, metadata_expires_at)
         VALUES (?, ?, ?, ?, ?, 'PAYMENT_VERIFIED', 'NOT_CHARGED', 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        new Date(
          new Date(invocation.now).getTime() + 30 * 24 * 60 * 60_000,
        ).toISOString(),
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

  async createReceipt(input: {
    invocationId: string;
    receiptBlobKey: string;
    receiptDigest: string;
    transactionHash: string;
    now: string;
  }): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO receipts
          (invocation_id, receipt_blob_key, receipt_digest, transaction_hash, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        input.invocationId,
        input.receiptBlobKey,
        input.receiptDigest,
        input.transactionHash,
        input.now,
      )
      .run();
  }

  async getReceipt(invocationId: string): Promise<
    | {
        invocationId: string;
        receiptBlobKey: string;
        receiptDigest: string;
        transactionHash: string;
        createdAt: string;
      }
    | undefined
  > {
    const row = await this.database
      .prepare("SELECT * FROM receipts WHERE invocation_id = ?")
      .bind(invocationId)
      .first<{
        invocation_id: string;
        receipt_blob_key: string;
        receipt_digest: string;
        transaction_hash: string;
        created_at: string;
      }>();
    return row
      ? {
          invocationId: row.invocation_id,
          receiptBlobKey: row.receipt_blob_key,
          receiptDigest: row.receipt_digest,
          transactionHash: row.transaction_hash,
          createdAt: row.created_at,
        }
      : undefined;
  }

  async markInputDeleted(invocationId: string, now: string): Promise<void> {
    await this.database
      .prepare(
        `UPDATE invocations SET input_deleted_at = COALESCE(input_deleted_at, ?)
         WHERE id = ?`,
      )
      .bind(now, invocationId)
      .run();
  }

  async listStaleInputs(
    cutoff: string,
  ): Promise<Array<{ id: string; inputBlobKey: string }>> {
    const { results } = await this.database
      .prepare(
        `SELECT id, input_blob_key FROM invocations
         WHERE input_deleted_at IS NULL AND created_at <= ?`,
      )
      .bind(cutoff)
      .all<{ id: string; input_blob_key: string }>();
    return results.map((row) => ({
      id: row.id,
      inputBlobKey: row.input_blob_key,
    }));
  }

  async listExpiredResults(now: string): Promise<
    Array<{
      id: string;
      version: number;
      resultBlobKey?: string;
      candidateResultBlobKey?: string;
    }>
  > {
    const { results } = await this.database
      .prepare(
        `SELECT id, version, result_blob_key, candidate_result_blob_key
         FROM invocations
         WHERE status = 'RESULT_AVAILABLE' AND result_expires_at <= ?`,
      )
      .bind(now)
      .all<{
        id: string;
        version: number;
        result_blob_key: string | null;
        candidate_result_blob_key: string | null;
      }>();
    return results.map((row) => ({
      id: row.id,
      version: row.version,
      resultBlobKey: optional(row.result_blob_key),
      candidateResultBlobKey: optional(row.candidate_result_blob_key),
    }));
  }

  async listExpiredMetadata(
    now: string,
  ): Promise<Array<{ id: string; quoteId: string; blobKeys: string[] }>> {
    const { results } = await this.database
      .prepare(
        `SELECT i.id, i.quote_id, i.input_blob_key, i.payment_blob_key,
                i.candidate_result_blob_key, i.result_blob_key, r.receipt_blob_key
         FROM invocations i
         LEFT JOIN receipts r ON r.invocation_id = i.id
         WHERE i.metadata_expires_at <= ?`,
      )
      .bind(now)
      .all<{
        id: string;
        quote_id: string;
        input_blob_key: string;
        payment_blob_key: string;
        candidate_result_blob_key: string | null;
        result_blob_key: string | null;
        receipt_blob_key: string | null;
      }>();
    return results.map((row) => ({
      id: row.id,
      quoteId: row.quote_id,
      blobKeys: [
        row.input_blob_key,
        row.payment_blob_key,
        row.candidate_result_blob_key,
        row.result_blob_key,
        row.receipt_blob_key,
      ].filter((key): key is string => typeof key === "string"),
    }));
  }

  async deleteInvocationMetadata(
    invocationId: string,
    quoteId: string,
  ): Promise<void> {
    await this.database
      .prepare("DELETE FROM receipts WHERE invocation_id = ?")
      .bind(invocationId)
      .run();
    await this.database
      .prepare("DELETE FROM invocations WHERE id = ? AND quote_id = ?")
      .bind(invocationId, quoteId)
      .run();
    await this.database
      .prepare("DELETE FROM quotes WHERE id = ? AND invocation_id = ?")
      .bind(quoteId, invocationId)
      .run();
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
           execution_started_at = COALESCE(?, execution_started_at),
           executed_at = COALESCE(?, executed_at),
           settled_at = COALESCE(?, settled_at),
           result_expires_at = COALESCE(?, result_expires_at),
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
        input.executionStartedAt ?? null,
        input.executedAt ?? null,
        input.settledAt ?? null,
        input.resultExpiresAt ?? null,
        input.now,
        input.id,
        input.from,
        input.expectedVersion,
      )
      .run();
    return result.meta.changes === 1;
  }
}
