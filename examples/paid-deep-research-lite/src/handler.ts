import { ResearchBudget, ResearchHandlerError } from "./budget";
import { safeRetry } from "./search-adapter";
import type {
  ModelProvider,
  ResearchInput,
  ResearchResult,
  SearchProvider,
} from "./types";

export class BoundedResearchHandler {
  constructor(
    private readonly ports: {
      search: SearchProvider;
      model: ModelProvider;
      allowedProcessors: string[];
      now?: () => number;
    },
  ) {}

  async execute(input: ResearchInput): Promise<ResearchResult> {
    if (
      typeof input !== "object" ||
      input === null ||
      typeof input.query !== "string" ||
      input.query.trim().length === 0 ||
      new TextEncoder().encode(JSON.stringify(input)).byteLength > 32_768
    ) {
      throw new ResearchHandlerError("INVALID_RESEARCH_INPUT");
    }
    for (const processor of [
      this.ports.search.processor,
      this.ports.model.processor,
    ]) {
      if (!this.ports.allowedProcessors.includes(processor)) {
        throw new ResearchHandlerError("UNDECLARED_PROCESSOR");
      }
    }
    const now = this.ports.now ?? Date.now;
    const budget = new ResearchBudget(now(), now);
    budget.search();
    const results = await safeRetry(() =>
      this.ports.search.search(input.query),
    );
    const pages: Array<{ url: string; text: string }> = [];
    for (const result of results.slice(0, 5)) {
      budget.page();
      pages.push({
        url: result.url,
        text: await safeRetry(() => this.ports.search.fetchPage(result.url)),
      });
    }
    const generated = await safeRetry(() =>
      this.ports.model.generate({
        query: input.query,
        pages,
        maximumOutputTokens: 3_000,
      }),
    );
    budget.complete(generated.outputTokens, generated.costUsd);
    return {
      report: generated.report,
      citations: generated.citations,
      telemetry: {
        searches: budget.searches,
        pages: budget.pages,
        outputTokens: budget.outputTokens,
        durationMs: budget.durationMs(),
        developerReportedCostUsd: budget.developerReportedCostUsd,
        processors: [this.ports.search.processor, this.ports.model.processor],
      },
    };
  }
}
