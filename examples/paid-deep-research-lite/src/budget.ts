export class ResearchHandlerError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ResearchHandlerError";
  }
}

export class ResearchBudget {
  searches = 0;
  pages = 0;
  outputTokens = 0;
  developerReportedCostUsd = 0;

  constructor(
    readonly startedAt: number,
    private readonly now: () => number,
    private readonly maximumCostUsd = 0.5,
  ) {}

  search(): void {
    this.checkTime();
    if (++this.searches > 5)
      throw new ResearchHandlerError("SEARCH_CAP_EXCEEDED");
  }

  page(): void {
    this.checkTime();
    if (++this.pages > 5) throw new ResearchHandlerError("PAGE_CAP_EXCEEDED");
  }

  complete(outputTokens: number, costUsd: number): void {
    this.checkTime();
    if (!Number.isInteger(outputTokens) || outputTokens > 3_000) {
      throw new ResearchHandlerError("OUTPUT_TOKEN_CAP_EXCEEDED");
    }
    if (
      !Number.isFinite(costUsd) ||
      costUsd < 0 ||
      costUsd > this.maximumCostUsd
    ) {
      throw new ResearchHandlerError("DEVELOPER_REPORTED_COST_CAP_EXCEEDED");
    }
    this.outputTokens = outputTokens;
    this.developerReportedCostUsd = costUsd;
  }

  durationMs(): number {
    return this.now() - this.startedAt;
  }

  checkTime(): void {
    if (this.durationMs() > 300_000)
      throw new ResearchHandlerError("HANDLER_TIMEOUT");
  }
}
