import {
  assertExactFields,
  inputDigest as digestInput,
  parseInputDigest,
  parseInvocationId,
  parseQuoteId,
  parseReleaseId,
  parseStatusEnvelope,
  verifyCanonicalSignature,
  type CanonicalSignature,
  type InputDigest,
  type InvocationId,
  type QuoteEnvelope,
  type ResultEnvelope,
  type SignedStatus,
  type SignatureDomain,
} from "@agentpaykit/protocol";

import {
  ClientContractError,
  type InstalledSkill,
  type VerifiedInstalledSkill,
} from "./release-verifier";
import { StatusPoller } from "./status-poller";

export interface QuoteResponse {
  payload: QuoteEnvelope;
  signature: CanonicalSignature;
  paymentRequired: string;
}

export interface RuntimeClientPort {
  quote(
    runtimeUrl: string,
    input: {
      invocationId: string;
      releaseId: string;
      inputDigest: string;
      environment: "testnet" | "mainnet";
    },
  ): Promise<QuoteResponse>;
  invoke(
    runtimeUrl: string,
    input: {
      request: {
        invocationId: string;
        quoteId: string;
        releaseId: string;
        inputDigest: string;
        environment: "testnet" | "mainnet";
        input: unknown;
      };
      paymentSignature: string;
    },
  ): Promise<SignedStatus>;
  status(runtimeUrl: string, id: string): Promise<SignedStatus>;
  result(
    runtimeUrl: string,
    id: string,
  ): Promise<{ payload: ResultEnvelope; signature: CanonicalSignature }>;
}

export interface InvocationHandle {
  invocationId: InvocationId;
  status: SignedStatus;
}

interface ClientPorts {
  releaseVerifier: {
    verify(skill: InstalledSkill): Promise<VerifiedInstalledSkill>;
  };
  digest(input: unknown): Promise<string>;
  runtime: RuntimeClientPort;
  paymentAuthorizer: {
    authorize(input: {
      paymentRequired: string;
      quote: QuoteEnvelope;
      skill: VerifiedInstalledSkill;
    }): Promise<string>;
  };
  signatureVerifier: {
    verify(
      domain: SignatureDomain,
      payload: unknown,
      signature: CanonicalSignature,
      runtime: VerifiedInstalledSkill["runtime"],
    ): Promise<boolean>;
  };
  bindings: {
    get(id: string): Promise<VerifiedInstalledSkill | undefined>;
    put(id: string, skill: VerifiedInstalledSkill): Promise<void>;
  };
  invocationId(): string;
  poll: {
    sleep(milliseconds: number): Promise<unknown>;
    maximumWaitMs: number;
  };
}

function parseQuote(value: unknown): QuoteEnvelope {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error();
    }
    const input = value as Record<string, unknown>;
    assertExactFields(input, [
      "schemaVersion",
      "quoteId",
      "invocationId",
      "releaseId",
      "inputDigest",
      "environment",
      "network",
      "amount",
      "asset",
      "payee",
      "paymentIdentifier",
      "issuedAt",
      "expiresAt",
    ]);
    const environment = input.environment;
    const network = input.network;
    if (
      input.schemaVersion !== "1" ||
      (environment !== "testnet" && environment !== "mainnet") ||
      (network !== "eip155:84532" && network !== "eip155:8453") ||
      (environment === "testnet" && network !== "eip155:84532") ||
      (environment === "mainnet" && network !== "eip155:8453") ||
      typeof input.amount !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(input.amount) ||
      typeof input.asset !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(input.asset) ||
      typeof input.payee !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(input.payee) ||
      typeof input.issuedAt !== "string" ||
      new Date(input.issuedAt).toISOString() !== input.issuedAt ||
      typeof input.expiresAt !== "string" ||
      new Date(input.expiresAt).toISOString() !== input.expiresAt ||
      input.expiresAt <= input.issuedAt
    ) {
      throw new Error();
    }
    return {
      schemaVersion: "1",
      quoteId: parseQuoteId(input.quoteId),
      invocationId: parseInvocationId(input.invocationId),
      releaseId: parseReleaseId(input.releaseId),
      inputDigest: parseInputDigest(input.inputDigest),
      environment,
      network,
      amount: input.amount,
      asset: input.asset as `0x${string}`,
      payee: input.payee as `0x${string}`,
      paymentIdentifier: parseInvocationId(input.paymentIdentifier),
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    };
  } catch {
    throw new ClientContractError("INVALID_QUOTE");
  }
}

function parseResult(value: unknown): ResultEnvelope {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error();
    }
    const input = value as Record<string, unknown>;
    assertExactFields(input, [
      "schemaVersion",
      "invocationId",
      "status",
      "resultDigest",
      "result",
    ]);
    if (input.schemaVersion !== "1" || input.status !== "RESULT_AVAILABLE") {
      throw new Error();
    }
    return {
      schemaVersion: "1",
      invocationId: parseInvocationId(input.invocationId),
      status: "RESULT_AVAILABLE",
      resultDigest: parseInputDigest(input.resultDigest) as `sha256:${string}`,
      result: input.result,
    };
  } catch {
    throw new ClientContractError("INVALID_RESULT");
  }
}

export class AgentPayClient {
  readonly portsForTest: ClientPorts;
  private readonly poller: StatusPoller;

  constructor(ports: ClientPorts) {
    this.portsForTest = ports;
    this.poller = new StatusPoller(ports.poll);
  }

  private async verifyRuntime(
    domain: SignatureDomain,
    payload: unknown,
    signature: CanonicalSignature,
    skill: VerifiedInstalledSkill,
  ): Promise<void> {
    if (
      signature.keyId !== skill.runtime.keyId ||
      !(await this.portsForTest.signatureVerifier.verify(
        domain,
        payload,
        signature,
        skill.runtime,
      ))
    ) {
      throw new ClientContractError("INVALID_RUNTIME_SIGNATURE");
    }
  }

  async invoke(
    skill: InstalledSkill,
    input: unknown,
  ): Promise<InvocationHandle> {
    const verified = await this.portsForTest.releaseVerifier.verify(skill);
    const digest = parseInputDigest(await this.portsForTest.digest(input));
    const invocationId = parseInvocationId(this.portsForTest.invocationId());
    await this.portsForTest.bindings.put(invocationId, verified);
    const quoted = await this.portsForTest.runtime.quote(verified.runtime.url, {
      invocationId,
      releaseId: verified.releaseId,
      inputDigest: digest,
      environment: verified.environment,
    });
    const quote = parseQuote(quoted.payload);
    if (
      quote.invocationId !== invocationId ||
      quote.paymentIdentifier !== invocationId ||
      quote.releaseId !== verified.releaseId ||
      quote.inputDigest !== digest ||
      quote.environment !== verified.environment
    ) {
      throw new ClientContractError("QUOTE_BINDING_MISMATCH");
    }
    await this.verifyRuntime(
      "runtime-quote-v1",
      quote,
      quoted.signature,
      verified,
    );
    const paymentSignature =
      await this.portsForTest.paymentAuthorizer.authorize({
        paymentRequired: quoted.paymentRequired,
        quote,
        skill: verified,
      });
    const signedStatus = await this.portsForTest.runtime.invoke(
      verified.runtime.url,
      {
        request: {
          invocationId,
          quoteId: quote.quoteId,
          releaseId: verified.releaseId,
          inputDigest: digest,
          environment: verified.environment,
          input,
        },
        paymentSignature,
      },
    );
    const status = parseStatusEnvelope(signedStatus.payload);
    if (status.invocationId !== invocationId) {
      throw new ClientContractError("STATUS_BINDING_MISMATCH");
    }
    await this.verifyRuntime(
      "runtime-status-v1",
      status,
      signedStatus.signature,
      verified,
    );
    return {
      invocationId,
      status: { payload: status, signature: signedStatus.signature },
    };
  }

  private async binding(id: string): Promise<VerifiedInstalledSkill> {
    const binding = await this.portsForTest.bindings.get(parseInvocationId(id));
    if (!binding) throw new ClientContractError("INVOCATION_HANDLE_NOT_FOUND");
    return binding;
  }

  async status(id: string): Promise<SignedStatus> {
    const invocationId = parseInvocationId(id);
    const skill = await this.binding(invocationId);
    const signed = await this.portsForTest.runtime.status(
      skill.runtime.url,
      invocationId,
    );
    const payload = parseStatusEnvelope(signed.payload);
    if (payload.invocationId !== invocationId) {
      throw new ClientContractError("STATUS_BINDING_MISMATCH");
    }
    await this.verifyRuntime(
      "runtime-status-v1",
      payload,
      signed.signature,
      skill,
    );
    return { payload, signature: signed.signature };
  }

  async resume(id: string): Promise<ResultEnvelope> {
    const invocationId = parseInvocationId(id);
    const skill = await this.binding(invocationId);
    await this.poller.wait(await this.status(invocationId), () =>
      this.status(invocationId),
    );
    const signed = await this.portsForTest.runtime.result(
      skill.runtime.url,
      invocationId,
    );
    const payload = parseResult(signed.payload);
    if (payload.invocationId !== invocationId) {
      throw new ClientContractError("RESULT_BINDING_MISMATCH");
    }
    await this.verifyRuntime(
      "runtime-result-v1",
      payload,
      signed.signature,
      skill,
    );
    return payload;
  }
}

export const defaultInputDigest = digestInput as (
  input: unknown,
) => Promise<InputDigest>;

export const defaultRuntimeSignatureVerifier = {
  verify(
    domain: SignatureDomain,
    payload: unknown,
    signature: CanonicalSignature,
    runtime: VerifiedInstalledSkill["runtime"],
  ): Promise<boolean> {
    return verifyCanonicalSignature(
      domain,
      payload,
      signature,
      runtime.publicKey,
    );
  },
};
