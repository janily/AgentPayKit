import type { SignedStatus } from "@agentpaykit/protocol";

import type { InvocationHandle } from "./client";
import { ClientContractError } from "./release-verifier";

const terminalWithoutResult = new Set([
  "FAILED_NOT_CHARGED",
  "POLICY_REJECTED",
  "RESULT_EXPIRED",
]);

export class InvocationPendingError extends ClientContractError {
  constructor(public readonly handle: InvocationHandle) {
    super("INVOCATION_PENDING");
    this.name = "InvocationPendingError";
  }
}

export class StatusPoller {
  constructor(
    private readonly options: {
      sleep(milliseconds: number): Promise<unknown>;
      maximumWaitMs: number;
    },
  ) {}

  async wait(
    initial: SignedStatus,
    read: () => Promise<SignedStatus>,
  ): Promise<SignedStatus> {
    let status = initial;
    let elapsed = 0;
    let delay = 100;
    while (status.payload.status !== "RESULT_AVAILABLE") {
      if (terminalWithoutResult.has(status.payload.status)) {
        throw new ClientContractError(status.payload.status);
      }
      if (elapsed + delay > this.options.maximumWaitMs) {
        throw new InvocationPendingError({
          invocationId: status.payload.invocationId,
          status,
        });
      }
      await this.options.sleep(delay);
      elapsed += delay;
      status = await read();
      delay = Math.min(delay * 2, 2_000);
    }
    return status;
  }
}
