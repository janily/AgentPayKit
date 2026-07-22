import type { DefinedPaidSkill } from "./config.js";

const LOOPBACK_HTTP_AUTHORITY =
  /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/;
export interface RenderSkillMarkdownOptions {
  origin: string;
}

export function resolveEndpoint(
  origin: string,
  endpointPath: "/api/invoke",
): URL {
  const rawAuthority = rawAuthorityFromOrigin(origin);
  let endpoint: URL;
  try {
    endpoint = new URL(origin);
  } catch {
    throw new Error("INVALID_SKILL_ORIGIN");
  }

  const isLoopbackHttp =
    endpoint.protocol === "http:" &&
    rawAuthority !== undefined &&
    isExplicitLoopbackHttpAuthority(rawAuthority);
  if (
    (endpoint.protocol !== "https:" && !isLoopbackHttp) ||
    endpoint.pathname !== "/"
  ) {
    throw new Error("INVALID_SKILL_ORIGIN");
  }

  endpoint.username = "";
  endpoint.password = "";
  endpoint.search = "";
  endpoint.hash = "";
  endpoint.pathname = endpointPath;

  return endpoint;
}

function rawAuthorityFromOrigin(origin: string): string | undefined {
  return /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(origin)?.[1];
}

function isExplicitLoopbackHttpAuthority(authority: string): boolean {
  const hostAndPort = authority.slice(authority.lastIndexOf("@") + 1);

  return LOOPBACK_HTTP_AUTHORITY.test(hostAndPort);
}

export function renderSkillMarkdown<TInput, TOutput>(
  skill: DefinedPaidSkill<TInput, TOutput>,
  options: RenderSkillMarkdownOptions,
): string {
  const endpoint = resolveEndpoint(options.origin, skill.endpointPath).href;
  const exampleInput = quotePosixShellArgument(
    JSON.stringify(skill.exampleInput),
  );

  return `# ${titleFromName(skill.name)}

${skill.description}

## Payment

- Price: ${skill.price} USDC per call
- Network: ${networkLabel(skill.network)}
- Human confirmation: required in MetaMask for every call

## Invocation

agentpay call ${endpoint} \\
--input-json ${exampleInput} \\
--max-price ${skill.price} \\
--json

Never bypass \`agentpay\`, increase \`--max-price\`, or retry \`PAYMENT_STATE_UNKNOWN\` without asking the user.
`;
}

function quotePosixShellArgument(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function titleFromName(name: string): string {
  return name
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function networkLabel(
  network: DefinedPaidSkill<unknown, unknown>["network"],
): string {
  return network === "base-sepolia" ? "Base Sepolia" : "Base";
}
