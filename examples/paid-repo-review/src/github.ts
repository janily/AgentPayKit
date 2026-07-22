const GITHUB_WEB_ORIGIN = "https://github.com";
const GITHUB_API_ORIGIN = "https://api.github.com";
const RAW_REPOSITORY_URL =
  /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)\/([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)$/;
const GITHUB_COMMIT_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export type RepositoryReviewErrorCode =
  | "INVALID_REPOSITORY_URL"
  | "UPSTREAM_NOT_FOUND"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_REJECTED"
  | "INVALID_UPSTREAM_JSON"
  | "UPSTREAM_ABORTED";

export class RepositoryReviewError extends Error {
  constructor(readonly code: RepositoryReviewErrorCode) {
    super(code);
    this.name = "RepositoryReviewError";
  }
}

export interface GitHubRepository {
  owner: string;
  repository: string;
  source: string;
}

interface RepositoryMetadata {
  fullName: string;
  stars: number;
  archived: boolean;
}

export function parsePublicGitHubRepository(value: string): GitHubRepository {
  const match = RAW_REPOSITORY_URL.exec(value);
  if (match === null) {
    throw new RepositoryReviewError("INVALID_REPOSITORY_URL");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RepositoryReviewError("INVALID_REPOSITORY_URL");
  }

  const [, owner, repository] = match;
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname !== `/${owner}/${repository}` ||
    url.href !== value
  ) {
    throw new RepositoryReviewError("INVALID_REPOSITORY_URL");
  }

  return {
    owner,
    repository,
    source: `${GITHUB_WEB_ORIGIN}/${owner}/${repository}`,
  };
}

export function isPublicGitHubRepository(value: string): boolean {
  try {
    parsePublicGitHubRepository(value);
    return true;
  } catch {
    return false;
  }
}

export async function getRepositoryMetadata(
  repository: GitHubRepository,
  signal: AbortSignal,
): Promise<RepositoryMetadata> {
  const value = await getJson(apiUrl(repository), signal);
  if (
    !isRecord(value) ||
    typeof value.full_name !== "string" ||
    value.full_name === "" ||
    typeof value.archived !== "boolean" ||
    !isNonNegativeInteger(value.stargazers_count)
  ) {
    throw new RepositoryReviewError("INVALID_UPSTREAM_JSON");
  }

  return {
    fullName: value.full_name,
    stars: value.stargazers_count,
    archived: value.archived,
  };
}

export async function getLanguages(
  repository: GitHubRepository,
  signal: AbortSignal,
): Promise<string[]> {
  const value = await getJson(`${apiUrl(repository)}/languages`, signal);
  if (
    !isRecord(value) ||
    Object.values(value).some((size) => !isNonNegativeInteger(size))
  ) {
    throw new RepositoryReviewError("INVALID_UPSTREAM_JSON");
  }

  return Object.keys(value).sort((left, right) => left.localeCompare(right));
}

export async function hasReadme(
  repository: GitHubRepository,
  signal: AbortSignal,
): Promise<boolean> {
  const response = await getResponse(`${apiUrl(repository)}/readme`, signal);
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw upstreamError(response);
  }
  return true;
}

export async function getRecentCommitDates(
  repository: GitHubRepository,
  signal: AbortSignal,
): Promise<string[]> {
  const value = await getJson(
    `${apiUrl(repository)}/commits?per_page=5`,
    signal,
  );
  if (!Array.isArray(value)) {
    throw new RepositoryReviewError("INVALID_UPSTREAM_JSON");
  }

  return value.map((entry) => {
    const date =
      isRecord(entry) &&
      isRecord(entry.commit) &&
      isRecord(entry.commit.committer)
        ? entry.commit.committer.date
        : undefined;
    return parseGitHubCommitDate(date);
  });
}

function apiUrl(repository: GitHubRepository): string {
  return `${GITHUB_API_ORIGIN}/repos/${repository.owner}/${repository.repository}`;
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await getResponse(url, signal);
  if (!response.ok) {
    throw upstreamError(response);
  }

  try {
    return await response.json();
  } catch (error) {
    if (signal.aborted || isAbortError(error)) {
      throw new RepositoryReviewError("UPSTREAM_ABORTED");
    }
    throw new RepositoryReviewError("INVALID_UPSTREAM_JSON");
  }
}

async function getResponse(
  url: string,
  signal: AbortSignal,
): Promise<Response> {
  if (signal.aborted) {
    throw new RepositoryReviewError("UPSTREAM_ABORTED");
  }

  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
  };
  if (token !== undefined && token !== "") {
    headers.authorization = `Bearer ${token}`;
  }

  try {
    return await fetch(url, { headers, redirect: "error", signal });
  } catch (error) {
    if (signal.aborted || isAbortError(error)) {
      throw new RepositoryReviewError("UPSTREAM_ABORTED");
    }
    throw new RepositoryReviewError("UPSTREAM_REJECTED");
  }
}

function upstreamError(response: Response): RepositoryReviewError {
  if (response.status === 404) {
    return new RepositoryReviewError("UPSTREAM_NOT_FOUND");
  }
  if (
    response.status === 403 &&
    response.headers.get("x-ratelimit-remaining") === "0"
  ) {
    return new RepositoryReviewError("UPSTREAM_RATE_LIMITED");
  }
  return new RepositoryReviewError("UPSTREAM_REJECTED");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function parseGitHubCommitDate(value: unknown): string {
  if (typeof value !== "string" || !GITHUB_COMMIT_TIMESTAMP.test(value)) {
    throw new RepositoryReviewError("INVALID_UPSTREAM_JSON");
  }

  const parsed = new Date(value);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString() !== `${value.slice(0, -1)}.000Z`
  ) {
    throw new RepositoryReviewError("INVALID_UPSTREAM_JSON");
  }

  return value.slice(0, 10);
}
