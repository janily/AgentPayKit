import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

import {
  validateEvidenceLineage,
  validateSecurityEvidence,
  validateSepoliaEvidence,
  validateSimulatedEvidence,
} from "./mainnet-evidence.mjs";

const env = process.env;

function fail(code) {
  throw new Error(`${code}. No transaction was broadcast.`);
}

function address(value, code) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value ?? "")) fail(code);
  return value.toLowerCase();
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function rpc(method, params) {
  const response = await fetch(env.MAINNET_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (!response.ok || body.error || body.result === undefined) {
    fail(`MAINNET_RPC_${method}_FAILED`);
  }
  return body.result;
}

async function usdcBalance(asset, account) {
  const accountWord = account.slice(2).padStart(64, "0");
  return BigInt(
    await rpc("eth_call", [
      { to: asset, data: `0x70a08231${accountWord}` },
      "latest",
    ]),
  );
}

const releaseDocument = await json(env.MAINNET_RELEASE_FILE);
const release = releaseDocument.payload ?? releaseDocument;
const payee = address(env.MAINNET_PAYEE_ADDRESS, "INVALID_MAINNET_PAYEE");
const asset = address(env.MAINNET_USDC_ADDRESS, "INVALID_MAINNET_USDC");
const codexWallet = address(
  env.MAINNET_CODEX_WALLET_ADDRESS,
  "INVALID_CODEX_WALLET",
);
const claudeWallet = address(
  env.MAINNET_CLAUDE_WALLET_ADDRESS,
  "INVALID_CLAUDE_WALLET",
);
if (codexWallet === claudeWallet) fail("MAINNET_WALLETS_MUST_BE_DISTINCT");
if (
  release.environment !== "mainnet" ||
  release.network !== "eip155:8453" ||
  release.amount !== "10000" ||
  String(release.payee).toLowerCase() !== payee ||
  String(release.asset).toLowerCase() !== asset ||
  !/^rel_[0-9a-f]{64}$/.test(release.releaseId ?? "")
) {
  fail("MAINNET_RELEASE_TERMS_MISMATCH");
}
if (env.MAINNET_BUDGET_LIMIT_ATOMIC !== "20000") {
  fail("MAINNET_BUDGET_MUST_EQUAL_20000");
}
const simulated = await json("artifacts/e2e-simulated.json");
const security = await json("artifacts/security-gates.json");
const sepolia = await json("artifacts/e2e-sepolia.json").catch(() => null);
validateSimulatedEvidence(simulated);
validateSecurityEvidence(security);
validateSepoliaEvidence(sepolia);
const trackedEvidence = spawnSync(
  "git",
  ["ls-files", "--error-unmatch", "artifacts/e2e-sepolia.json"],
  { encoding: "utf8" },
);
const testedCommitIsAncestor = spawnSync(
  "git",
  [
    "merge-base",
    "--is-ancestor",
    sepolia.commit,
    env.AGENTPAY_PREFLIGHT_COMMIT,
  ],
  { encoding: "utf8" },
);
const changesAfterTest = spawnSync(
  "git",
  [
    "diff",
    "--name-only",
    `${sepolia.commit}..${env.AGENTPAY_PREFLIGHT_COMMIT}`,
  ],
  { encoding: "utf8" },
);
const changedPaths = changesAfterTest.stdout.trim().split("\n").filter(Boolean);
validateEvidenceLineage({
  trackedStatus: trackedEvidence.status,
  ancestorStatus: testedCommitIsAncestor.status,
  changesStatus: changesAfterTest.status,
  changedPaths,
});

const spend = spawnSync(
  process.execPath,
  ["packages/cli/dist/index.js", "spend", "--json"],
  { encoding: "utf8", env: { ...env, AGENTPAYKIT_HOME: env.AGENTPAYKIT_HOME } },
);
if (spend.status !== 0) fail("CLIENT_BUDGET_UNREADABLE");
const spendOutput = JSON.parse(spend.stdout);
if (spendOutput?.data?.limit !== "20000") {
  fail("CLIENT_BUDGET_MUST_EQUAL_20000");
}

for (const wallet of [codexWallet, claudeWallet]) {
  if ((await usdcBalance(asset, wallet)) < 10_000n) {
    fail("MAINNET_WALLET_USDC_INSUFFICIENT");
  }
  if (BigInt(await rpc("eth_getBalance", [wallet, "latest"])) === 0n) {
    fail("MAINNET_WALLET_GAS_INSUFFICIENT");
  }
}

process.stdout.write(
  `${JSON.stringify({
    schemaVersion: "1",
    ok: true,
    releaseId: release.releaseId,
    network: release.network,
    amount: release.amount,
    budgetLimit: env.MAINNET_BUDGET_LIMIT_ATOMIC,
    walletCount: 2,
    broadcast: false,
  })}\n`,
);
