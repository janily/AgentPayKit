import { describe, expect, it } from "vitest";

import skill from "../agentpay.skill.js";
import { reviewRepository } from "../src/review-repository.js";

describe("paid repository review skill", () => {
  it("uses the fixed paid endpoint", () => {
    expect(skill.endpointPath).toBe("/api/invoke");
  });

  it("keeps business behavior importable", async () => {
    await expect(
      reviewRepository(
        "https://github.com/owner/repository",
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      sources: ["https://github.com/owner/repository"],
    });
  });
});
