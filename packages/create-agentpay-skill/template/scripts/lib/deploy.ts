import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { decodePaymentRequiredHeader } from "@x402/core/http";
import { getDefaultAsset } from "@x402/evm";
import {
  renderSkillMarkdown,
  usdcToAtomic,
  validatePaidSkillConfig,
} from "@agentpaykit/server";

import skill from "../../agentpay.skill.js";

const SCAFFOLD_PAYEE = "0x1111111111111111111111111111111111111111";

export type RunCommand = (argv: string[], cwd: string) => Promise<string>;

export interface DeploySkillOptions {
  run: RunCommand;
  fetch: typeof globalThis.fetch;
  cwd: string;
}

export interface DeploySkillResult {
  origin: string;
  endpoint: string;
}

export async function deploySkill({
  run,
  fetch,
  cwd,
}: DeploySkillOptions): Promise<DeploySkillResult> {
  assertPublishablePayee(skill.payTo);
  validatePaidSkillConfig(skill);

  await run(["pnpm", "test"], cwd);
  await run(["pnpm", "typecheck"], cwd);
  await run(["pnpm", "build"], cwd);
  const deploymentOutput = await run(
    ["vercel", "deploy", "--prod", "--yes"],
    cwd,
  );

  const origin = parseVercelOrigin(deploymentOutput);
  const endpoint = `${origin}${skill.endpointPath}`;
  await verifyDeployedQuote({ fetch, endpoint, origin });

  const skillDirectory = join(cwd, "skill");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(
    join(skillDirectory, "SKILL.md"),
    renderSkillMarkdown(skill, { origin }),
  );

  return { origin, endpoint };
}

export function assertPublishablePayee(payTo: string): void {
  if (payTo.toLowerCase() === SCAFFOLD_PAYEE) {
    throw new Error("PLACEHOLDER_PAY_TO");
  }
}

function parseVercelOrigin(stdout: string): string {
  const value = stdout.trim();
  if (value === "" || /[\r\n]/.test(value)) {
    throw new Error("INVALID_VERCEL_DEPLOYMENT_URL");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("INVALID_VERCEL_DEPLOYMENT_URL");
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("INVALID_VERCEL_DEPLOYMENT_URL");
  }

  return url.origin;
}

async function verifyDeployedQuote({
  fetch,
  endpoint,
  origin,
}: {
  fetch: typeof globalThis.fetch;
  endpoint: string;
  origin: string;
}): Promise<void> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(skill.exampleInput),
    });
  } catch {
    throw quoteMismatch(origin, "endpoint probe failed");
  }

  if (response.status !== 402) {
    throw quoteMismatch(
      origin,
      `expected HTTP 402, received ${response.status}`,
    );
  }

  const header = response.headers.get("payment-required");
  if (header === null) {
    throw quoteMismatch(origin, "PAYMENT-REQUIRED header is missing");
  }

  let challenge: unknown;
  try {
    challenge = decodePaymentRequiredHeader(header);
  } catch {
    throw quoteMismatch(origin, "PAYMENT-REQUIRED header is malformed");
  }

  if (
    !isRecord(challenge) ||
    !isRecord(challenge.resource) ||
    !Array.isArray(challenge.accepts)
  ) {
    throw quoteMismatch(origin, "PAYMENT-REQUIRED header is malformed");
  }

  const requirement = challenge.accepts[0];
  const expectedNetwork =
    skill.network === "base-sepolia" ? "eip155:84532" : "eip155:8453";
  const expectedAmount = usdcToAtomic(skill.price).toString();
  const expectedAsset = getDefaultAsset(expectedNetwork).address.toLowerCase();

  if (
    challenge.x402Version !== 2 ||
    challenge.resource.url !== endpoint ||
    challenge.accepts.length !== 1 ||
    !isRecord(requirement) ||
    requirement.scheme !== "exact" ||
    requirement.network !== expectedNetwork ||
    typeof requirement.asset !== "string" ||
    requirement.asset.toLowerCase() !== expectedAsset ||
    requirement.amount !== expectedAmount ||
    requirement.payTo !== skill.payTo
  ) {
    throw quoteMismatch(origin, "live payment terms do not match config");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function quoteMismatch(origin: string, reason: string): Error {
  return new Error(
    `DEPLOYED_QUOTE_MISMATCH: deployment exists but publication verification failed at ${origin}: ${reason}`,
  );
}
