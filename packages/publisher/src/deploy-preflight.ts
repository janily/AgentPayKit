import type { SignedRelease } from "./release-signer";

const requiredSecrets = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CDP_API_KEY_ID",
  "CDP_API_KEY_SECRET",
  "UPSTREAM_API_KEY",
  "AGENTPAY_ENCRYPTION_KEY",
] as const;

export class DeployPreflightError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "DeployPreflightError";
  }
}

export function deployPreflight(input: {
  environment: "testnet" | "mainnet";
  release: SignedRelease;
  configDigest: string;
  expectedConfigDigest: string;
  secrets: Record<string, string | undefined>;
  confirmation?: string;
}): { wranglerConfig: string; releaseId: string } {
  const expectedNetwork =
    input.environment === "testnet" ? "eip155:84532" : "eip155:8453";
  if (
    input.release.payload.environment !== input.environment ||
    input.release.payload.network !== expectedNetwork
  ) {
    throw new DeployPreflightError("RELEASE_ENVIRONMENT_MISMATCH");
  }
  if (input.configDigest !== input.expectedConfigDigest) {
    throw new DeployPreflightError("RELEASE_CONFIG_DIGEST_DRIFT");
  }
  const missing = requiredSecrets.filter((name) => !input.secrets[name]);
  if (missing.length) {
    throw new DeployPreflightError(`MISSING_DEPLOY_SECRET_${missing[0]}`);
  }
  if (
    input.environment === "mainnet" &&
    input.confirmation !== `DEPLOY MAINNET ${input.release.payload.releaseId}`
  ) {
    throw new DeployPreflightError("MAINNET_CONFIRMATION_REQUIRED");
  }
  return {
    wranglerConfig: `wrangler.${input.environment}.jsonc`,
    releaseId: input.release.payload.releaseId,
  };
}

export { requiredSecrets as publisherDeploySecrets };
