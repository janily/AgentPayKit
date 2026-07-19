import { describe, expect, test } from "vitest";

import {
  deployPreflight,
  publisherDeploySecrets,
  type SignedRelease,
} from "../src/index";

const release = {
  payload: {
    environment: "testnet",
    network: "eip155:84532",
    releaseId: `rel_${"a".repeat(64)}`,
  },
} as SignedRelease;
const secrets = Object.fromEntries(
  publisherDeploySecrets.map((name) => [name, "configured"]),
);

describe("publisher deployment preflight", () => {
  test("blocks missing secrets, wrong network and config drift", () => {
    expect(() =>
      deployPreflight({
        environment: "testnet",
        release,
        configDigest: "same",
        expectedConfigDigest: "same",
        secrets: { ...secrets, CDP_API_KEY_ID: undefined },
      }),
    ).toThrow("MISSING_DEPLOY_SECRET_CDP_API_KEY_ID");
    expect(() =>
      deployPreflight({
        environment: "mainnet",
        release,
        configDigest: "same",
        expectedConfigDigest: "same",
        secrets,
      }),
    ).toThrow("RELEASE_ENVIRONMENT_MISMATCH");
    expect(() =>
      deployPreflight({
        environment: "testnet",
        release,
        configDigest: "changed",
        expectedConfigDigest: "expected",
        secrets,
      }),
    ).toThrow("RELEASE_CONFIG_DIGEST_DRIFT");
  });

  test("requires literal mainnet confirmation", () => {
    const mainnet = {
      ...release,
      payload: {
        ...release.payload,
        environment: "mainnet",
        network: "eip155:8453",
      },
    } as SignedRelease;
    expect(() =>
      deployPreflight({
        environment: "mainnet",
        release: mainnet,
        configDigest: "same",
        expectedConfigDigest: "same",
        secrets,
        confirmation: "yes",
      }),
    ).toThrow("MAINNET_CONFIRMATION_REQUIRED");
    expect(
      deployPreflight({
        environment: "mainnet",
        release: mainnet,
        configDigest: "same",
        expectedConfigDigest: "same",
        secrets,
        confirmation: `DEPLOY MAINNET ${mainnet.payload.releaseId}`,
      }),
    ).toMatchObject({ wranglerConfig: "wrangler.mainnet.jsonc" });
  });
});
