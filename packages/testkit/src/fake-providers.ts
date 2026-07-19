import type { StoreFault } from "./faults";

export class FakeQueue<T extends { invocationId: string }> {
  readonly messages: T[] = [];
  private readonly invocationIds = new Set<string>();

  send(message: T): "enqueued" | "duplicate" {
    if (this.invocationIds.has(message.invocationId)) return "duplicate";
    this.invocationIds.add(message.invocationId);
    this.messages.push(structuredClone(message));
    return "enqueued";
  }
}

export class FakeStore {
  private readonly records = new Map<string, unknown>();

  constructor(private readonly fault?: StoreFault) {}

  async put(key: string, value: unknown): Promise<void> {
    this.assertAvailable();
    this.records.set(key, structuredClone(value));
  }

  async get(key: string): Promise<unknown> {
    this.assertAvailable();
    const value = this.records.get(key);
    return value === undefined ? undefined : structuredClone(value);
  }

  private assertAvailable(): void {
    if (this.fault === "d1-failure") throw new Error("D1_FAILURE");
    if (this.fault === "r2-failure") throw new Error("R2_FAILURE");
  }
}
