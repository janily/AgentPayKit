import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { decodePaymentRequiredHeader } from "@x402/core/http";
import {
  buildPaidSkillDescriptor,
  canonicalDescriptorJson,
  descriptorPath,
  renderSkillMarkdown,
  validatePaidSkillConfig,
  verifyDescriptorIntegrity,
  verifyDescriptorMatchesChallenge,
  type PaidSkillDescriptor,
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
  const descriptor = await verifyDeployedPublication({
    fetch,
    endpoint,
    origin,
  });

  const skillDirectory = join(cwd, "skill");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(
    join(skillDirectory, "paid-skill.json"),
    `${canonicalDescriptorJson(descriptor)}\n`,
  );
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

async function verifyDeployedPublication({
  fetch,
  endpoint,
  origin,
}: {
  fetch: typeof globalThis.fetch;
  endpoint: string;
  origin: string;
}): Promise<PaidSkillDescriptor> {
  const descriptor = await verifyDeployedDescriptor({ fetch, origin });

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

  try {
    verifyDescriptorMatchesChallenge(descriptor, challenge);
  } catch {
    throw quoteMismatch(origin, "live payment terms do not match descriptor");
  }

  return descriptor;
}

async function verifyDeployedDescriptor({
  fetch,
  origin,
}: {
  fetch: typeof globalThis.fetch;
  origin: string;
}): Promise<PaidSkillDescriptor> {
  const descriptorUrl = `${origin}${descriptorPath()}`;
  let response: Response;
  try {
    response = await fetch(descriptorUrl, {
      method: "GET",
      redirect: "manual",
    });
  } catch {
    throw quoteMismatch(origin, "descriptor probe failed");
  }

  if (response.status !== 200) {
    throw quoteMismatch(
      origin,
      `expected descriptor HTTP 200, received ${response.status}`,
    );
  }

  let descriptor: PaidSkillDescriptor;
  try {
    descriptor = (await response.json()) as PaidSkillDescriptor;
    verifyDescriptorIntegrity(descriptor);
  } catch {
    throw quoteMismatch(origin, "descriptor is malformed");
  }

  const expected = buildPaidSkillDescriptor(skill, { origin });
  if (
    canonicalDescriptorJson(descriptor) !== canonicalDescriptorJson(expected)
  ) {
    throw quoteMismatch(origin, "live descriptor does not match config");
  }

  return descriptor;
}

function quoteMismatch(origin: string, reason: string): Error {
  return new Error(
    `DEPLOYED_QUOTE_MISMATCH: deployment exists but publication verification failed at ${origin}: ${reason}`,
  );
}
