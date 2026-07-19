import {
  parseInputDigest,
  parseInvocationId,
  parseReleaseId,
  type CanonicalSignature,
  type ReceiptEnvelope,
} from "@agentpaykit/protocol";

export class ReceiptService {
  constructor(
    private readonly ports: {
      vault: {
        putJson(
          key: string,
          value: unknown,
        ): Promise<{ key: string; digest: string }>;
      };
      signer: {
        sign(payload: ReceiptEnvelope): Promise<CanonicalSignature>;
      };
    },
  ) {}

  async create(input: {
    invocationId: string;
    releaseId: string;
    inputDigest: string;
    payer: `0x${string}`;
    payee: `0x${string}`;
    network: "eip155:84532" | "eip155:8453";
    asset: `0x${string}`;
    amount: string;
    transactionHash: `0x${string}`;
    executionStartedAt: string;
    executedAt: string;
    settledAt: string;
    resultDigest: `sha256:${string}`;
  }): Promise<{
    blobKey: string;
    digest: string;
    transactionHash: string;
  }> {
    const payload: ReceiptEnvelope = {
      schemaVersion: "1",
      invocationId: parseInvocationId(input.invocationId),
      releaseId: parseReleaseId(input.releaseId),
      inputDigest: parseInputDigest(input.inputDigest),
      payer: input.payer,
      payee: input.payee,
      network: input.network,
      asset: input.asset,
      amount: input.amount,
      transactionHash: input.transactionHash,
      executionStartedAt: input.executionStartedAt,
      executedAt: input.executedAt,
      settledAt: input.settledAt,
      resultDigest: input.resultDigest,
    };
    const signed = {
      payload,
      signature: await this.ports.signer.sign(payload),
    };
    const stored = await this.ports.vault.putJson(
      `${input.invocationId}/receipt`,
      signed,
    );
    return {
      blobKey: stored.key,
      digest: stored.digest,
      transactionHash: input.transactionHash,
    };
  }
}
