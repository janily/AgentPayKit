export interface HandlerExecutionInput<Release = unknown> {
  invocationId: string;
  input: unknown;
  release: Release;
}

export class TimedHandlerRunner<Release = unknown> {
  constructor(
    private readonly handler: (
      input: HandlerExecutionInput<Release>,
      signal: AbortSignal,
    ) => Promise<unknown>,
  ) {}

  async run(
    input: HandlerExecutionInput<Release>,
    maximumExecutionMs: number,
  ): Promise<unknown> {
    if (!Number.isSafeInteger(maximumExecutionMs) || maximumExecutionMs <= 0) {
      throw new TypeError("maximumExecutionMs must be a positive safe integer");
    }
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort("execution timeout");
        reject(new Error("HANDLER_TIMEOUT"));
      }, maximumExecutionMs);
    });
    try {
      return await Promise.race([
        this.handler(input, controller.signal),
        deadline,
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
