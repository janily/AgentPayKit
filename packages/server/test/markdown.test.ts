import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  definePaidSkill,
  renderSkillMarkdown,
  resolveEndpoint,
  type Schema,
} from "../src/index";

interface ExampleInput {
  topic: string;
}

const exampleInputSchema: Schema<ExampleInput> = {
  safeParse(value) {
    return typeof value === "object" &&
      value !== null &&
      typeof (value as { topic?: unknown }).topic === "string"
      ? { success: true, data: value as ExampleInput }
      : { success: false, error: {} };
  },
};

const stringSchema: Schema<string> = {
  safeParse(value) {
    return typeof value === "string"
      ? { success: true, data: value }
      : { success: false, error: {} };
  },
};

const skill = definePaidSkill({
  name: "paid-repository-review",
  description:
    "Use this Skill when the user asks to review a public GitHub repository.",
  endpointPath: "/api/invoke",
  price: "0.05",
  network: "base-sepolia",
  payTo: "0x1111111111111111111111111111111111111111",
  exampleInput: { topic: "configured example" },
  input: exampleInputSchema,
  output: stringSchema,
  async execute(input) {
    return input.topic;
  },
});

describe("resolveEndpoint", () => {
  it("strips credentials, query, and fragment from an HTTPS origin", () => {
    expect(
      resolveEndpoint(
        "https://publisher:secret@paid-repo-review.vercel.app/?preview=true#section",
        "/api/invoke",
      ).href,
    ).toBe("https://paid-repo-review.vercel.app/api/invoke");
  });

  it.each([
    "http://paid-repo-review.vercel.app/",
    "http://127.1/",
    "http://0x7f000001/",
    "http://2130706433/",
    "http://LOCALHOST/",
    "ftp://paid-repo-review.vercel.app/",
    "https://paid-repo-review.vercel.app/skill",
  ])("rejects unsafe origin %s", (origin) => {
    expect(() => resolveEndpoint(origin, "/api/invoke")).toThrow(
      "INVALID_SKILL_ORIGIN",
    );
  });

  it.each([
    ["http://localhost/", "http://localhost/api/invoke"],
    ["http://localhost:3000/", "http://localhost:3000/api/invoke"],
    ["http://127.0.0.1/", "http://127.0.0.1/api/invoke"],
    ["http://127.0.0.1:3000/", "http://127.0.0.1:3000/api/invoke"],
    ["http://[::1]/", "http://[::1]/api/invoke"],
    ["http://[::1]:3000/", "http://[::1]:3000/api/invoke"],
  ])("allows explicit loopback HTTP origin %s", (origin, endpoint) => {
    expect(resolveEndpoint(origin, "/api/invoke").href).toBe(endpoint);
  });

  it("strips credentials, query, and fragment from a loopback HTTP origin", () => {
    expect(
      resolveEndpoint(
        "http://publisher:secret@localhost:3000/?preview=true#section",
        "/api/invoke",
      ).href,
    ).toBe("http://localhost:3000/api/invoke");
  });
});

describe("renderSkillMarkdown", () => {
  it("renders a complete deterministic paid-Skill instruction", () => {
    const options = { origin: "https://paid-repo-review.vercel.app/" };
    const markdown = renderSkillMarkdown(skill, options);

    expect(markdown).toBe(
      `# Paid Repository Review

Use this Skill when the user asks to review a public GitHub repository.

## Payment

- Price: 0.05 USDC per call
- Network: Base Sepolia
- Human confirmation: required in MetaMask for every call

## Invocation

agentpay call https://paid-repo-review.vercel.app/api/invoke \\
--input-json '{"topic":"configured example"}' \\
--max-price 0.05 \\
--json

Never bypass \`agentpay\`, increase \`--max-price\`, or retry \`PAYMENT_STATE_UNKNOWN\` without asking the user.
`,
    );
    expect(renderSkillMarkdown(skill, options)).toBe(markdown);
  });

  it("uses its resolved endpoint consistently without secret placeholders", () => {
    const markdown = renderSkillMarkdown(skill, {
      origin: "https://paid-repo-review.vercel.app/",
    });

    expect(markdown).toContain(
      "https://paid-repo-review.vercel.app/api/invoke",
    );
    expect(markdown).toContain("Price: 0.05 USDC");
    expect(markdown).toContain("--max-price 0.05");
    expect(markdown).toContain("Network: Base Sepolia");
    expect(markdown).not.toContain("GITHUB_TOKEN");
    expect(markdown).not.toContain("PAYMENT-SIGNATURE");
  });

  it("quotes apostrophes and shell-looking JSON as one POSIX argv value", () => {
    const exampleInput = {
      topic: "O'Reilly'; printf injected; # $(printf substituted)",
    };
    const quotedSkill = definePaidSkill({
      ...skill,
      exampleInput,
    });
    const markdown = renderSkillMarkdown(quotedSkill, {
      origin: "https://paid-repo-review.vercel.app/",
    });
    const line = markdown
      .split("\n")
      .find((candidate) => candidate.startsWith("--input-json "));

    expect(line).toBe(
      `--input-json '{"topic":"O'"'"'Reilly'"'"'; printf injected; # $(printf substituted)"}' \\`,
    );

    const prefix = "--input-json ";
    const suffix = " \\";
    const shellArgument = line!.slice(prefix.length, -suffix.length);
    const captured = execFileSync(
      "/bin/sh",
      ["-c", `set -- ${shellArgument}; printf '%s' "$1"`],
      { encoding: "utf8" },
    );

    expect(captured).toBe(JSON.stringify(exampleInput));
  });
});
