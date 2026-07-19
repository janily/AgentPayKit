export interface ResearchInput {
  query: string;
}

export interface SearchResult {
  url: string;
  title: string;
}

export interface ResearchResult {
  report: string;
  citations: string[];
  telemetry: {
    searches: number;
    pages: number;
    outputTokens: number;
    durationMs: number;
    developerReportedCostUsd: number;
    processors: string[];
  };
}

export interface SearchProvider {
  processor: string;
  search(query: string): Promise<SearchResult[]>;
  fetchPage(url: string): Promise<string>;
}

export interface ModelProvider {
  processor: string;
  generate(input: {
    query: string;
    pages: Array<{ url: string; text: string }>;
    maximumOutputTokens: number;
  }): Promise<{
    report: string;
    citations: string[];
    outputTokens: number;
    costUsd: number;
  }>;
}
