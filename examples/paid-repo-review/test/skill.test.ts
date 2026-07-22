import { readFile } from "node:fs/promises";

import { executePaidSkill, renderSkillMarkdown } from "@agentpaykit/server";
import { describe, expect, it, vi } from "vitest";

import skill from "../agentpay.skill.js";

describe("paid repository review skill", () => {
  it("uses the fixed paid endpoint", () => {
    expect(skill.endpointPath).toBe("/api/invoke");
  });

  it("uses an exact public GitHub repository as its example input", () => {
    expect(skill.exampleInput).toEqual({
      repository: "https://github.com/openai/openai-node",
    });
    expect(skill.input.safeParse(skill.exampleInput).success).toBe(true);
  });

  it("converts typed GitHub failures into a non-successful paid execution", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    try {
      await expect(
        executePaidSkill(skill, skill.exampleInput),
      ).rejects.toMatchObject({
        code: "EXECUTION_FAILED",
        status: 502,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects malformed GitHub metadata before a paid execution can succeed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          full_name: "openai/openai-node",
          stargazers_count: 1200,
          archived: "false",
        }),
      ),
    );
    try {
      await expect(
        executePaidSkill(skill, skill.exampleInput),
      ).rejects.toMatchObject({
        code: "EXECUTION_FAILED",
        status: 502,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("commits the rendered Skill documentation for its published origin", async () => {
    await expect(
      readFile(
        new URL("../../../skills/paid-repo-review/SKILL.md", import.meta.url),
        "utf8",
      ),
    ).resolves.toBe(
      renderSkillMarkdown(skill, {
        origin: "https://paid-repo-review.vercel.app",
      }),
    );
  });
});
