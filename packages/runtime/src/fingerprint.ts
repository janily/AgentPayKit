import { digestJson, sha256 } from "@agentpaykit/protocol";

export interface InvocationFingerprintInput {
  invocationId: string;
  quoteId: string;
  releaseId: string;
  inputDigest: string;
  environment: "testnet" | "mainnet";
  paymentHeader: string;
}

export async function invocationFingerprint(
  input: InvocationFingerprintInput,
): Promise<`sha256:${string}`> {
  const paymentHeaderDigest = await sha256(
    new TextEncoder().encode(input.paymentHeader),
  );
  return digestJson({
    environment: input.environment,
    inputDigest: input.inputDigest,
    invocationId: input.invocationId,
    paymentHeaderDigest,
    quoteId: input.quoteId,
    releaseId: input.releaseId,
  });
}
