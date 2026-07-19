import {
  parseInputDigest,
  parseInvocationId,
  parseSignedReceipt,
  parseTraceId,
  type CanonicalSignature,
  type ChargeState,
  type InvocationStatus,
  type ResultEnvelope,
  type SignedEnvelope,
  type SignedStatus,
} from "@agentpaykit/protocol";

import { RuntimeRequestError } from "./invocation-service";

interface RecoveryInvocation {
  id: string;
  status: InvocationStatus;
  chargeState: ChargeState;
  version: number;
  traceId: string;
  updatedAt: string;
  resultBlobKey?: string;
  resultDigest?: string;
}

export class RecoveryService {
  constructor(
    private readonly ports: {
      repository: {
        getInvocation(id: string): Promise<RecoveryInvocation | undefined>;
        getReceipt(
          invocationId: string,
        ): Promise<{ receiptBlobKey: string } | undefined>;
      };
      vault: { getJson(key: string): Promise<unknown> };
      signer: {
        sign(payload: unknown): Promise<CanonicalSignature>;
      };
    },
  ) {}

  private async invocation(id: string): Promise<RecoveryInvocation> {
    const parsedId = parseInvocationId(id);
    const invocation = await this.ports.repository.getInvocation(parsedId);
    if (!invocation) throw new RuntimeRequestError("INVOCATION_NOT_FOUND", 404);
    return invocation;
  }

  async status(id: string): Promise<SignedStatus> {
    const invocation = await this.invocation(id);
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

  async result(id: string): Promise<SignedEnvelope<ResultEnvelope>> {
    const invocation = await this.invocation(id);
    if (invocation.status === "RESULT_EXPIRED") {
      throw new RuntimeRequestError("RESULT_EXPIRED", 410, "CHARGED");
    }
    if (
      invocation.status !== "RESULT_AVAILABLE" ||
      !invocation.resultBlobKey ||
      !invocation.resultDigest
    ) {
      throw new RuntimeRequestError(
        "RESULT_NOT_AVAILABLE",
        425,
        invocation.chargeState,
      );
    }
    parseInputDigest(invocation.resultDigest);
    const payload: ResultEnvelope = {
      schemaVersion: "1",
      invocationId: parseInvocationId(invocation.id),
      status: "RESULT_AVAILABLE",
      resultDigest: invocation.resultDigest as `sha256:${string}`,
      result: await this.ports.vault.getJson(invocation.resultBlobKey),
    };
    return { payload, signature: await this.ports.signer.sign(payload) };
  }

  async receipt(id: string): Promise<unknown> {
    const invocation = await this.invocation(id);
    if (invocation.chargeState !== "CHARGED") {
      throw new RuntimeRequestError(
        "RECEIPT_NOT_AVAILABLE",
        425,
        invocation.chargeState,
      );
    }
    const receipt = await this.ports.repository.getReceipt(invocation.id);
    if (!receipt) {
      throw new RuntimeRequestError("RECEIPT_NOT_AVAILABLE", 425, "CHARGED");
    }
    let signed;
    try {
      signed = parseSignedReceipt(
        await this.ports.vault.getJson(receipt.receiptBlobKey),
      );
    } catch {
      throw new RuntimeRequestError("INVALID_RECEIPT", 500, "CHARGED");
    }
    if (signed.payload.invocationId !== invocation.id) {
      throw new RuntimeRequestError("INVALID_RECEIPT", 500, "CHARGED");
    }
    return signed;
  }
}
