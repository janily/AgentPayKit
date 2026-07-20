import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const env = process.env;
const expectedScenarios = {
  "happy-path": ["RESULT_AVAILABLE", "CHARGED", 1, 1, 1, true],
  "data-rejected": ["FAILED_NOT_CHARGED", "NOT_CHARGED", 0, 0, 0, false],
  "wallet-rejected": ["QUOTED", "NOT_CHARGED", 0, 0, 0, false],
  "wrong-network": ["QUOTED", "NOT_CHARGED", 0, 0, 0, false],
  "insufficient-balance": ["QUOTED", "NOT_CHARGED", 0, 0, 0, false],
  "quote-expired": ["QUOTED", "NOT_CHARGED", 0, 0, 0, false],
  "concurrent-submit": ["RESULT_AVAILABLE", "CHARGED", 1, 1, 1, true],
  "input-mismatch": ["QUOTED", "NOT_CHARGED", 0, 0, 0, false],
  "handler-timeout": ["FAILED_NOT_CHARGED", "NOT_CHARGED", 1, 0, 0, false],
  "policy-failed": ["POLICY_REJECTED", "NOT_CHARGED", 1, 0, 0, false],
  "settle-recovery": ["RESULT_AVAILABLE", "CHARGED", 1, 1, 1, true],
  "cli-resume": ["RESULT_AVAILABLE", "CHARGED", 1, 1, 1, true],
};
const chainScenarios = new Set([
  "happy-path",
  "concurrent-submit",
  "handler-timeout",
  "policy-failed",
  "settle-recovery",
  "cli-resume",
]);

function expectedOutcome(values) {
  const [
    finalStatus,
    chargeState,
    executionCount,
    settleCount,
    transferCount,
    resultVisible,
  ] = values;
  return {
    finalStatus,
    chargeState,
    executionCount,
    settleCount,
    transferCount,
    resultVisible,
  };
}

function exactScenarioSet(results) {
  return (
    Array.isArray(results) &&
    results.length === 12 &&
    new Set(results.map(({ name }) => name)).size === 12 &&
    Object.keys(expectedScenarios).every((name) =>
      results.some((result) => result.name === name),
    )
  );
}

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
if (
  simulated.passed !== 12 ||
  simulated.failed !== 0 ||
  !exactScenarioSet(simulated.results) ||
  simulated.results.some(
    (result) =>
      result.passed !== true ||
      JSON.stringify(result.expected) !==
        JSON.stringify(expectedOutcome(expectedScenarios[result.name])) ||
      JSON.stringify(result.actual) !== JSON.stringify(result.expected),
  )
) {
  fail("SIMULATED_GATE_NOT_PASSED");
}
if (
  security.passed !== 8 ||
  security.failed !== 0 ||
  !Array.isArray(security.gates) ||
  security.gates.length !== 8
) {
  fail("SECURITY_GATE_NOT_PASSED");
}
const trackedEvidence = spawnSync(
  "git",
  ["ls-files", "--error-unmatch", "artifacts/e2e-sepolia.json"],
  { encoding: "utf8" },
);
if (trackedEvidence.status !== 0) fail("SEPOLIA_EVIDENCE_NOT_TRACKED");
if (
  !sepolia ||
  !/^[0-9a-f]{40}$/.test(sepolia.commit ?? "") ||
  sepolia.network !== "eip155:84532" ||
  !/^rel_[0-9a-f]{64}$/.test(sepolia.releaseId ?? "") ||
  !Number.isFinite(Date.parse(sepolia.capturedAt ?? "")) ||
  sepolia.passed !== 12 ||
  sepolia.failed !== 0 ||
  !exactScenarioSet(sepolia.scenarios)
) {
  fail("SEPOLIA_GATE_NOT_PASSED");
}
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
if (testedCommitIsAncestor.status !== 0) {
  fail("SEPOLIA_TESTED_COMMIT_NOT_ANCESTOR");
}
const evidenceOnlyPaths = new Set([
  "artifacts/e2e-sepolia.json",
  "artifacts/release-evidence.json",
  "docs/acceptance/m7-sepolia.md",
]);
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
if (
  changesAfterTest.status !== 0 ||
  !changedPaths.includes("artifacts/e2e-sepolia.json") ||
  changedPaths.some((path) => !evidenceOnlyPaths.has(path))
) {
  fail("NON_EVIDENCE_CHANGE_AFTER_SEPOLIA_GATE");
}
const invocationIds = new Set();
const transactionHashes = new Set();
const receiptDigests = new Set();
for (const scenario of sepolia.scenarios) {
  const expected = expectedOutcome(expectedScenarios[scenario.name]);
  if (
    JSON.stringify(scenario.outcome) !== JSON.stringify(expected) ||
    scenario.finalStatus !== expected.finalStatus ||
    scenario.chargeState !== expected.chargeState ||
    scenario.mode !== (chainScenarios.has(scenario.name) ? "chain" : "bridge")
  ) {
    fail("SEPOLIA_SCENARIO_EVIDENCE_INVALID");
  }
  if (
    scenario.mode === "chain" &&
    !/^inv_[0-9A-HJKMNP-TV-Z]{26}$/.test(scenario.invocationId ?? "")
  ) {
    fail("SEPOLIA_INVOCATION_EVIDENCE_INVALID");
  }
  if (scenario.mode === "chain") {
    if (invocationIds.has(scenario.invocationId)) {
      fail("SEPOLIA_INVOCATION_EVIDENCE_DUPLICATE");
    }
    invocationIds.add(scenario.invocationId);
  }
  if (expected.transferCount === 1) {
    if (
      !/^0x[0-9a-fA-F]{64}$/.test(scenario.transactionHash ?? "") ||
      !/^0x[0-9a-fA-F]+$/.test(scenario.blockNumber ?? "") ||
      !/^sha256:[0-9a-f]{64}$/.test(scenario.receiptDigest ?? "")
    ) {
      fail("SEPOLIA_PAYMENT_EVIDENCE_INVALID");
    }
    const transactionHash = scenario.transactionHash.toLowerCase();
    if (
      transactionHashes.has(transactionHash) ||
      receiptDigests.has(scenario.receiptDigest)
    ) {
      fail("SEPOLIA_PAYMENT_EVIDENCE_DUPLICATE");
    }
    transactionHashes.add(transactionHash);
    receiptDigests.add(scenario.receiptDigest);
  } else if (scenario.transactionHash || scenario.receiptDigest) {
    fail("SEPOLIA_ZERO_CHARGE_EVIDENCE_INVALID");
  }
}
const chargedAtomic = BigInt(
  sepolia.scenarios.filter(({ name }) => expectedScenarios[name][4] === 1)
    .length * 10_000,
);
if (
  BigInt(sepolia.walletSpendDelta) !== chargedAtomic ||
  BigInt(sepolia.payeeBalanceDelta) !== chargedAtomic
) {
  fail("SEPOLIA_BALANCE_EVIDENCE_INVALID");
}

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
