import type {
  CanonicalSignature,
  ResultEnvelope,
  SignedStatus,
} from "@agentpaykit/protocol";

import type { QuoteResponse, RuntimeClientPort } from "./client";

async function json(response: Response): Promise<unknown> {
  const body = await response.json();
  if (!response.ok && response.status !== 402) {
    throw new Error(`RUNTIME_HTTP_${response.status}`);
  }
  return body;
}

export class RuntimeHttpClient implements RuntimeClientPort {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async quote(
    runtimeUrl: string,
    input: Parameters<RuntimeClientPort["quote"]>[1],
  ): Promise<QuoteResponse> {
    const response = await this.fetcher(
      new URL("/v1/invocations/quote", runtimeUrl),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    const body = (await json(response)) as {
      quote: QuoteResponse["payload"];
      signature: CanonicalSignature;
    };
    return {
      payload: body.quote,
      signature: body.signature,
      paymentRequired: response.headers.get("PAYMENT-REQUIRED") ?? "",
    };
  }

  async invoke(
    runtimeUrl: string,
    input: Parameters<RuntimeClientPort["invoke"]>[1],
  ): Promise<SignedStatus> {
    const response = await this.fetcher(
      new URL("/v1/invocations", runtimeUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "PAYMENT-SIGNATURE": input.paymentSignature,
        },
        body: JSON.stringify(input.request),
      },
    );
    return (await json(response)) as SignedStatus;
  }

  async status(runtimeUrl: string, id: string): Promise<SignedStatus> {
    return (await json(
      await this.fetcher(
        new URL(`/v1/invocations/${encodeURIComponent(id)}/status`, runtimeUrl),
      ),
    )) as SignedStatus;
  }

  async result(
    runtimeUrl: string,
    id: string,
  ): Promise<{ payload: ResultEnvelope; signature: CanonicalSignature }> {
    return (await json(
      await this.fetcher(
        new URL(`/v1/invocations/${encodeURIComponent(id)}/result`, runtimeUrl),
      ),
    )) as { payload: ResultEnvelope; signature: CanonicalSignature };
  }
}
