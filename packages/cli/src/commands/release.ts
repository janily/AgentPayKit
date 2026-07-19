import { readFile } from "node:fs/promises";

import {
  buildRelease,
  deployPreflight,
  releaseSigningMessage,
  verifyRelease,
  type ReleaseBody,
  type ReleasePayload,
  type SignedRelease,
} from "@agentpaykit/publisher";
import type { Hex } from "viem";

import { option, required } from "./shared";

export async function releaseCommand(args: string[]) {
  const action = required(args[0], "RELEASE_ACTION_REQUIRED");
  const environment = required(
    option(args, "--environment"),
    "ENVIRONMENT_REQUIRED",
  );
  if (environment !== "testnet" && environment !== "mainnet") {
    throw Object.assign(new Error("INVALID_ENVIRONMENT"), {
      code: "INVALID_ENVIRONMENT",
    });
  }
  if (action === "build") {
    const body = JSON.parse(
      await readFile(
        required(option(args, "--body"), "RELEASE_BODY_REQUIRED"),
        "utf8",
      ),
    ) as ReleaseBody;
    const payload = await buildRelease(body);
    if (payload.environment !== environment) {
      throw Object.assign(new Error("RELEASE_ENVIRONMENT_MISMATCH"), {
        code: "RELEASE_ENVIRONMENT_MISMATCH",
      });
    }
    return { payload, signingMessage: releaseSigningMessage(payload) };
  }
  const releasePath = required(
    option(args, "--release"),
    "RELEASE_PATH_REQUIRED",
  );
  const parsed = JSON.parse(await readFile(releasePath, "utf8")) as
    SignedRelease | ReleasePayload;
  if (action === "sign") {
    if (!("releaseId" in parsed)) {
      throw Object.assign(new Error("UNSIGNED_RELEASE_REQUIRED"), {
        code: "UNSIGNED_RELEASE_REQUIRED",
      });
    }
    const release: SignedRelease = {
      payload: parsed,
      signature: {
        algorithm: "EIP191",
        signer: required(
          option(args, "--signer"),
          "SIGNER_REQUIRED",
        ) as `0x${string}`,
        value: required(
          option(args, "--signature"),
          "SIGNATURE_REQUIRED",
        ) as Hex,
      },
    };
    await verifyRelease(release);
    return release;
  }
  const release = parsed as SignedRelease;
  if (action === "verify") {
    await verifyRelease(release);
    return {
      verified: true,
      releaseId: release.payload.releaseId,
      environment,
    };
  }
  if (action === "deploy") {
    await verifyRelease(release);
    const approved = deployPreflight({
      environment,
      release,
      configDigest: required(
        option(args, "--config-digest"),
        "CONFIG_DIGEST_REQUIRED",
      ),
      expectedConfigDigest: required(
        option(args, "--expected-config-digest"),
        "EXPECTED_CONFIG_DIGEST_REQUIRED",
      ),
      secrets: process.env,
      confirmation: option(args, "--confirm"),
    });
    return {
      ...approved,
      command: `wrangler deploy --config ${approved.wranglerConfig}`,
      executed: false,
    };
  }
  throw Object.assign(new Error("INVALID_RELEASE_ACTION"), {
    code: "INVALID_RELEASE_ACTION",
  });
}
