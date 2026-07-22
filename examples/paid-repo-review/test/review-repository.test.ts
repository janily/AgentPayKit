import { afterEach, describe, expect, it, vi } from "vitest";

import { reviewRepository } from "../src/review-repository.js";

const REPOSITORY = "https://github.com/openai/openai-node";
const API_ROOT = "https://api.github.com/repos/openai/openai-node";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("reviewRepository", () => {
  it.each([
    "http://github.com/openai/openai-node",
    "https://github.com",
    "https://github.com/openai",
    "https://github.com/openai/openai-node/issues",
    "https://github.com/openai/openai-node/",
    "https://github.com/openai/openai-node?tab=readme",
    "https://github.com/openai/openai-node?",
    "https://github.com/openai/openai-node#readme",
    "https://github.com/openai/openai-node#",
    "https://github.com:443/openai/openai-node",
    "https://github.com/openai/../openai-node",
    "https://github.com/openai/%2e%2e/openai-node",
    "https://github.com/openai%2Fother/openai-node",
    "https://github.com/openai/openai%2Dnode",
    "HTTPS://github.com/openai/openai-node",
    "https://GitHub.com/openai/openai-node",
    "https://user:pass@github.com/openai/openai-node",
    "https://api.github.com/openai/openai-node",
    "https://127.0.0.1/openai/openai-node",
    "https://[::1]/openai/openai-node",
  ])("rejects unsafe repository URL %s", async (repository) => {
    await expect(
      reviewRepository(repository, new AbortController().signal),
    ).rejects.toMatchObject({ code: "INVALID_REPOSITORY_URL" });
  });

  it("fetches only the fixed GitHub endpoints and derives a review", async () => {
    const fetch = githubFetch();
    vi.stubGlobal("fetch", fetch);

    await expect(
      reviewRepository(REPOSITORY, new AbortController().signal),
    ).resolves.toEqual({
      summary:
        "openai/openai-node is an active public repository with 1,200 stars and 2 primary languages.",
      signals: [
        "README is present.",
        "Primary languages: JavaScript, TypeScript.",
        "Latest commit: 2026-07-20.",
        "5 recent commits were available.",
      ],
      recommendations: [
        "Review the README and recent commits before integrating.",
      ],
      sources: [REPOSITORY],
    });

    expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
      API_ROOT,
      `${API_ROOT}/languages`,
      `${API_ROOT}/readme`,
      `${API_ROOT}/commits?per_page=5`,
    ]);
  });

  it("adds GITHUB_TOKEN only as an Authorization request header", async () => {
    const fetch = githubFetch();
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    vi.stubGlobal("fetch", fetch);

    const result = await reviewRepository(
      REPOSITORY,
      new AbortController().signal,
    );

    expect(JSON.stringify(result)).not.toContain("test-token");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      headers: { authorization: "Bearer test-token" },
    });
  });

  it("refuses redirects without attempting a second or cross-origin request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://example.invalid/redirected" },
        }),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      reviewRepository(REPOSITORY, new AbortController().signal),
    ).rejects.toMatchObject({ code: "UPSTREAM_REJECTED" });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(API_ROOT);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
  });

  it.each([
    [
      "not found",
      new Response("not found", { status: 404 }),
      "UPSTREAM_NOT_FOUND",
    ],
    [
      "rate limited",
      new Response("slow down", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      }),
      "UPSTREAM_RATE_LIMITED",
    ],
    ["invalid JSON", new Response("not json"), "INVALID_UPSTREAM_JSON"],
  ])(
    "throws a typed error when GitHub returns %s",
    async (_name, response, code) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response),
      );

      await expect(
        reviewRepository(REPOSITORY, new AbortController().signal),
      ).rejects.toMatchObject({ code });
    },
  );

  it("turns aborts into a typed error", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      reviewRepository(REPOSITORY, controller.signal),
    ).rejects.toMatchObject({
      code: "UPSTREAM_ABORTED",
    });
  });

  it("turns an abort while parsing an upstream body into a typed error", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(
        async () =>
          ({
            ok: true,
            json: async () => {
              controller.abort();
              throw new DOMException("aborted", "AbortError");
            },
          }) as unknown as Response,
      ),
    );

    await expect(
      reviewRepository(REPOSITORY, controller.signal),
    ).rejects.toMatchObject({ code: "UPSTREAM_ABORTED" });
  });

  it.each([
    [
      "empty metadata full name",
      "metadata",
      { full_name: "", stargazers_count: 1200, archived: false },
    ],
    [
      "non-boolean metadata archived flag",
      "metadata",
      { full_name: "openai/openai-node", stargazers_count: 1200, archived: 0 },
    ],
    [
      "fractional metadata stars",
      "metadata",
      {
        full_name: "openai/openai-node",
        stargazers_count: 1.5,
        archived: false,
      },
    ],
    ["languages array", "languages", [100, 10]],
    ["fractional language byte count", "languages", { TypeScript: 1.5 }],
    [
      "non-canonical GitHub commit timestamp",
      "commits",
      [{ commit: { committer: { date: "2026-07-20T12:00:00.000Z" } } }],
    ],
    [
      "normalized-but-invalid GitHub commit timestamp",
      "commits",
      [{ commit: { committer: { date: "2026-02-30T12:00:00Z" } } }],
    ],
  ] as const)(
    "rejects malformed but parseable %s",
    async (_name, endpoint, body) => {
      vi.stubGlobal("fetch", githubFetch({ [endpoint]: body }));

      await expect(
        reviewRepository(REPOSITORY, new AbortController().signal),
      ).rejects.toMatchObject({ code: "INVALID_UPSTREAM_JSON" });
    },
  );
});

type GitHubEndpoint = "metadata" | "languages" | "readme" | "commits";

function githubFetch(
  responses: Partial<Record<GitHubEndpoint, Response | unknown>> = {},
) {
  return vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = String(input);
    if (url === API_ROOT) {
      return responseFor(responses.metadata, {
        full_name: "openai/openai-node",
        stargazers_count: 1200,
        archived: false,
      });
    }
    if (url === `${API_ROOT}/languages`) {
      return responseFor(responses.languages, {
        TypeScript: 100,
        JavaScript: 10,
      });
    }
    if (url === `${API_ROOT}/readme`) {
      return responseFor(responses.readme, { name: "README.md" });
    }
    if (url === `${API_ROOT}/commits?per_page=5`) {
      return responseFor(responses.commits, [
        { commit: { committer: { date: "2026-07-20T12:00:00Z" } } },
        { commit: { committer: { date: "2026-07-19T12:00:00Z" } } },
        { commit: { committer: { date: "2026-07-18T12:00:00Z" } } },
        { commit: { committer: { date: "2026-07-17T12:00:00Z" } } },
        { commit: { committer: { date: "2026-07-16T12:00:00Z" } } },
      ]);
    }
    throw new Error(`Unexpected outbound URL: ${url}`);
  });
}

function responseFor(value: Response | unknown, fallback: unknown): Response {
  return value instanceof Response ? value : Response.json(value ?? fallback);
}
