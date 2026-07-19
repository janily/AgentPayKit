import {
  assertExactFields,
  parseInputDigest,
  parseInvocationId,
  parseQuoteId,
  parseReleaseId,
  type CanonicalSignature,
  type QuoteEnvelope,
} from "@agentpaykit/protocol";

export interface ReleasePaymentTerms {
  id: string;
  environment: "testnet" | "mainnet";
  network: "eip155:84532" | "eip155:8453";
  amount: string;
  asset: `0x${string}`;
  payee: `0x${string}`;
}

export interface QuoteRequest {
  invocationId: string;
  releaseId: string;
  inputDigest: string;
  environment: "testnet" | "mainnet";
}

export class QuoteService {
  constructor(
    private readonly ports: {
      releases: {
        get(
          id: string,
          environment: "testnet" | "mainnet",
        ): Promise<ReleasePaymentTerms | undefined>;
      };
      quotes: { create(quote: QuoteEnvelope): Promise<unknown> };
      challenge: { issue(quote: QuoteEnvelope): Promise<string> };
      signer: {
        sign(payload: QuoteEnvelope): Promise<CanonicalSignature>;
      };
      quoteId(): string;
      now(): Date;
    },
  ) {}

  async create(request: QuoteRequest): Promise<{
    quote: QuoteEnvelope;
    signature: CanonicalSignature;
    paymentRequired: string;
  }> {
    assertExactFields(request as unknown as Record<string, unknown>, [
      "invocationId",
      "releaseId",
      "inputDigest",
      "environment",
    ]);
    const invocationId = parseInvocationId(request.invocationId);
    const releaseId = parseReleaseId(request.releaseId);
    const digest = parseInputDigest(request.inputDigest);
    if (
      request.environment !== "testnet" &&
      request.environment !== "mainnet"
    ) {
      throw new TypeError("unknown environment");
    }
    const release = await this.ports.releases.get(
      releaseId,
      request.environment,
    );
    const expectedNetwork =
      request.environment === "testnet" ? "eip155:84532" : "eip155:8453";
    if (
      !release ||
      release.id !== releaseId ||
      release.environment !== request.environment ||
      release.network !== expectedNetwork
    ) {
      throw new Error("RELEASE_NOT_FOUND");
    }
    const issuedAt = this.ports.now();
    const quote: QuoteEnvelope = {
      schemaVersion: "1",
      quoteId: parseQuoteId(this.ports.quoteId()),
      invocationId,
      releaseId,
      inputDigest: digest,
      environment: request.environment,
      network: release.network,
      amount: release.amount,
      asset: release.asset,
      payee: release.payee,
      paymentIdentifier: invocationId,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + 5 * 60_000).toISOString(),
    };
    await this.ports.quotes.create(quote);
    const [paymentRequired, signature] = await Promise.all([
      this.ports.challenge.issue(quote),
      this.ports.signer.sign(quote),
    ]);
    return { quote, signature, paymentRequired };
  }
}
