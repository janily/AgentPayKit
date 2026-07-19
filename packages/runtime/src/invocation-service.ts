import {
  inputDigest as calculateInputDigest,
  parseInputDigest,
  parseInvocationId,
  parseQuoteId,
  parseReleaseId,
  parseTraceId,
  type CanonicalSignature,
  type ChargeState,
  type InvocationStatus,
  type SignedStatus,
} from "@agentpaykit/protocol";

import {
  invocationFingerprint,
  type InvocationFingerprintInput,
} from "./fingerprint";
import type { NewInvocation, TransitionInvocation } from "./repository";

interface ReleaseRecord {
  id: string;
  environment: "testnet" | "mainnet";
  network: "eip155:84532" | "eip155:8453";
  amount: string;
  asset: `0x${string}`;
  payee: `0x${string}`;
}

interface QuoteRecord {
  id: string;
  invocationId: string;
  releaseId: string;
  inputDigest: string;
  environment: "testnet" | "mainnet";
  expiresAt: string;
}

interface StoredInvocation {
  id: string;
  requestFingerprint: string;
  status: InvocationStatus;
  chargeState: ChargeState;
  version: number;
  traceId: string;
  updatedAt: string;
}

interface VerifiedPaymentSnapshot {
  schemaVersion: "1";
  verifiedAt: string;
  paymentPayload: Record<string, unknown>;
  paymentRequirements: Record<string, unknown>;
  declaredExtensions?: Record<string, unknown>;
}

export interface AcceptInvocationInput extends InvocationFingerprintInput {
  input: unknown;
  method: string;
  url: string;
}

export class RuntimeRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly chargeState: ChargeState = "NOT_CHARGED",
  ) {
    super(code);
    this.name = "RuntimeRequestError";
  }
}

export class InvocationService {
  constructor(
    private readonly ports: {
      releases: {
        get(
          id: string,
          environment: "testnet" | "mainnet",
        ): Promise<ReleaseRecord | undefined>;
      };
      quotes: { get(id: string): Promise<QuoteRecord | undefined> };
      paymentIdentifier: { read(paymentHeader: string): string | null };
      payment: {
        verify(
          input: {
            paymentHeader: string;
            method: string;
            url: string;
          },
          release: ReleaseRecord,
        ): Promise<{
          paymentPayload: Record<string, unknown>;
          paymentRequirements: Record<string, unknown>;
          declaredExtensions?: Record<string, unknown>;
        }>;
      };
      vault: {
        putJson(
          key: string,
          value: unknown,
        ): Promise<{ key: string; digest: string }>;
        delete(key: string): Promise<unknown>;
      };
      repository: {
        getInvocation(id: string): Promise<StoredInvocation | undefined>;
        createOrGetInvocation(input: NewInvocation): Promise<{
          kind: "created" | "existing";
          invocation: StoredInvocation;
        }>;
        transition(input: TransitionInvocation): Promise<boolean>;
      };
      queue: {
        send(job: {
          invocationId: string;
          expectedVersion: number;
        }): Promise<unknown>;
      };
      signer: {
        sign(payload: SignedStatus["payload"]): Promise<CanonicalSignature>;
      };
      now(): Date;
      traceId(): string;
    },
  ) {}

  fingerprintForTest(
    input: InvocationFingerprintInput,
  ): Promise<`sha256:${string}`> {
    return invocationFingerprint(input);
  }

  private async signedStatus(
    invocation: StoredInvocation,
  ): Promise<SignedStatus> {
    const payload: SignedStatus["payload"] = {
      schemaVersion: "1",
      invocationId: parseInvocationId(invocation.id),
      status: invocation.status,
      chargeState: invocation.chargeState,
      version: invocation.version,
      updatedAt: invocation.updatedAt,
      traceId: parseTraceId(invocation.traceId),
    };
    return { payload, signature: await this.ports.signer.sign(payload) };
  }

  async accept(
    input: AcceptInvocationInput,
  ): Promise<{ status: SignedStatus; replayed: boolean }> {
    const invocationId = parseInvocationId(input.invocationId);
    const quoteId = parseQuoteId(input.quoteId);
    const releaseId = parseReleaseId(input.releaseId);
    const declaredInputDigest = parseInputDigest(input.inputDigest);
    if (input.environment !== "testnet" && input.environment !== "mainnet") {
      throw new RuntimeRequestError("INVALID_ENVIRONMENT", 400);
    }
    const release = await this.ports.releases.get(releaseId, input.environment);
    const expectedNetwork =
      input.environment === "testnet" ? "eip155:84532" : "eip155:8453";
    if (
      !release ||
      release.id !== releaseId ||
      release.environment !== input.environment ||
      release.network !== expectedNetwork
    ) {
      throw new RuntimeRequestError("RELEASE_NOT_FOUND", 404);
    }
    const quote = await this.ports.quotes.get(quoteId);
    if (!quote) throw new RuntimeRequestError("QUOTE_NOT_FOUND", 404);
    if ((await calculateInputDigest(input.input)) !== declaredInputDigest) {
      throw new RuntimeRequestError("INPUT_DIGEST_MISMATCH", 400);
    }
    if (
      quote.invocationId !== invocationId ||
      quote.releaseId !== releaseId ||
      quote.inputDigest !== declaredInputDigest ||
      quote.environment !== input.environment
    ) {
      throw new RuntimeRequestError("QUOTE_BINDING_MISMATCH", 400);
    }
    const now = this.ports.now();
    if (new Date(quote.expiresAt).getTime() <= now.getTime()) {
      throw new RuntimeRequestError("QUOTE_EXPIRED", 400);
    }
    if (
      this.ports.paymentIdentifier.read(input.paymentHeader) !== invocationId
    ) {
      throw new RuntimeRequestError("PAYMENT_IDENTIFIER_MISMATCH", 400);
    }

    const fingerprint = await invocationFingerprint(input);
    const existing = await this.ports.repository.getInvocation(invocationId);
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        throw new RuntimeRequestError("INVOCATION_BINDING_CONFLICT", 409);
      }
      return { status: await this.signedStatus(existing), replayed: true };
    }

    const verified = await this.ports.payment.verify(
      {
        paymentHeader: input.paymentHeader,
        method: input.method,
        url: input.url,
      },
      release,
    );
    const snapshot: VerifiedPaymentSnapshot = {
      schemaVersion: "1",
      verifiedAt: now.toISOString(),
      paymentPayload: verified.paymentPayload,
      paymentRequirements: verified.paymentRequirements,
      ...(verified.declaredExtensions
        ? { declaredExtensions: verified.declaredExtensions }
        : {}),
    };
    const traceId = this.ports.traceId();
    const inputBlob = await this.ports.vault.putJson(
      `${invocationId}/${traceId}/input`,
      input.input,
    );
    const paymentBlob = await this.ports.vault.putJson(
      `${invocationId}/${traceId}/payment`,
      snapshot,
    );
    const persisted = await this.ports.repository.createOrGetInvocation({
      id: invocationId,
      quoteId,
      releaseId,
      inputDigest: declaredInputDigest,
      requestFingerprint: fingerprint,
      inputBlobKey: inputBlob.key,
      inputBlobDigest: inputBlob.digest,
      paymentBlobKey: paymentBlob.key,
      paymentBlobDigest: paymentBlob.digest,
      traceId,
      now: now.toISOString(),
    });
    if (persisted.kind === "existing") {
      await Promise.all([
        this.ports.vault.delete(inputBlob.key),
        this.ports.vault.delete(paymentBlob.key),
      ]);
      if (persisted.invocation.requestFingerprint !== fingerprint) {
        throw new RuntimeRequestError("INVOCATION_BINDING_CONFLICT", 409);
      }
      return {
        status: await this.signedStatus(persisted.invocation),
        replayed: true,
      };
    }
    const queuedAt = now.toISOString();
    const transitioned = await this.ports.repository.transition({
      id: invocationId,
      from: "PAYMENT_VERIFIED",
      to: "QUEUED",
      expectedVersion: persisted.invocation.version,
      now: queuedAt,
    });
    if (!transitioned) {
      throw new RuntimeRequestError("INVOCATION_STATE_CONFLICT", 409);
    }
    await this.ports.queue.send({
      invocationId,
      expectedVersion: persisted.invocation.version + 1,
    });
    const queued: StoredInvocation = {
      ...persisted.invocation,
      status: "QUEUED",
      version: persisted.invocation.version + 1,
      updatedAt: queuedAt,
    };
    return { status: await this.signedStatus(queued), replayed: false };
  }
}
