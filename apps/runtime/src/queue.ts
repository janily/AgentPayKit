import { parseInvocationId } from "@agentpaykit/protocol";
import type { InvocationJob } from "@agentpaykit/runtime-core";

interface QueueMessagePort {
  body: unknown;
  ack(): void;
  retry(): void;
}

interface QueueBatchPort {
  messages: QueueMessagePort[];
}

function parseJob(value: unknown): InvocationJob | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const object = value as Record<string, unknown>;
  if (
    Object.keys(object).some(
      (key) => key !== "invocationId" && key !== "expectedVersion",
    ) ||
    !Number.isSafeInteger(object.expectedVersion) ||
    (object.expectedVersion as number) < 0
  ) {
    return undefined;
  }
  try {
    return {
      invocationId: parseInvocationId(object.invocationId),
      expectedVersion: object.expectedVersion as number,
    };
  } catch {
    return undefined;
  }
}

export async function processInvocationBatch(
  batch: QueueBatchPort,
  consumer: { process(job: InvocationJob): Promise<unknown> },
): Promise<void> {
  await Promise.all(
    batch.messages.map(async (message) => {
      const job = parseJob(message.body);
      if (!job) {
        message.ack();
        return;
      }
      try {
        await consumer.process(job);
        message.ack();
      } catch {
        message.retry();
      }
    }),
  );
}
