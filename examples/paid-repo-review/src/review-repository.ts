import {
  getLanguages,
  getRecentCommitDates,
  getRepositoryMetadata,
  hasReadme,
  parsePublicGitHubRepository,
} from "./github";

export interface ReviewResult {
  summary: string;
  signals: string[];
  recommendations: string[];
  sources: string[];
}

export async function reviewRepository(
  repository: string,
  signal: AbortSignal,
): Promise<ReviewResult> {
  const source = parsePublicGitHubRepository(repository);
  const metadata = await getRepositoryMetadata(source, signal);
  const languages = await getLanguages(source, signal);
  const readme = await hasReadme(source, signal);
  const commitDates = await getRecentCommitDates(source, signal);
  const latestCommit = commitDates[0];
  const signals = [
    readme ? "README is present." : "README was not found.",
    `Primary languages: ${languages.length === 0 ? "none reported" : languages.join(", ")}.`,
    latestCommit === undefined
      ? "No recent commits were available."
      : `Latest commit: ${latestCommit}.`,
    `${commitDates.length} recent commits were available.`,
  ];
  if (metadata.archived) {
    signals.push("Repository is archived.");
  }

  return {
    summary: `${metadata.fullName} is an ${metadata.archived ? "archived" : "active"} public repository with ${metadata.stars.toLocaleString("en-US")} stars and ${languages.length} primary languages.`,
    signals,
    recommendations: recommendationsFor({
      readme,
      commitDates,
      archived: metadata.archived,
    }),
    sources: [source.source],
  };
}

function recommendationsFor({
  readme,
  commitDates,
  archived,
}: {
  readme: boolean;
  commitDates: string[];
  archived: boolean;
}): string[] {
  if (archived) {
    return ["Prefer an actively maintained alternative before integrating."];
  }
  if (!readme) {
    return ["Read the source carefully because no README was available."];
  }
  if (commitDates.length === 0) {
    return [
      "Inspect maintenance history because no recent commits were available.",
    ];
  }
  return ["Review the README and recent commits before integrating."];
}
