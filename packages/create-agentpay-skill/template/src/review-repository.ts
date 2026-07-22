export interface RepositoryReview {
  summary: string;
  signals: string[];
  recommendations: string[];
  sources: string[];
}

export async function reviewRepository(
  repository: string,
  signal: AbortSignal,
): Promise<RepositoryReview> {
  if (signal.aborted) {
    throw signal.reason;
  }

  const source = new URL(repository).href;
  return {
    summary: `Review starter for ${source}`,
    signals: ["Replace this starter review with your repository analysis."],
    recommendations: ["Keep business logic in src/review-repository.ts."],
    sources: [source],
  };
}
