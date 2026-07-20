import { describe, expect, test } from "vitest";

import {
  expectedOutcome,
  expectedScenarios,
  validateEvidenceLineage,
  validateSecurityEvidence,
  validateSepoliaEvidence,
  validateSimulatedEvidence,
} from "../../scripts/mainnet-evidence.mjs";

const chainScenarios = new Set([
  "happy-path",
  "concurrent-submit",
  "handler-timeout",
  "policy-failed",
  "settle-recovery",
  "cli-resume",
]);

function scenarioEvidence() {
  return Object.entries(expectedScenarios).map(([name, values], index) => {
    const outcome = expectedOutcome(values);
    const chain = chainScenarios.has(name);
    const paid = outcome.transferCount === 1;
    return {
      name,
      mode: chain ? "chain" : "bridge",
      ...(chain
        ? { invocationId: `inv_${String(index).padStart(26, "0")}` }
        : {}),
      ...(paid
        ? {
            transactionHash: `0x${index.toString(16).padStart(64, "0")}`,
            blockNumber: `0x${(index + 1).toString(16)}`,
            receiptDigest: `sha256:${(index + 1).toString(16).padStart(64, "0")}`,
          }
        : {}),
      finalStatus: outcome.finalStatus,
      chargeState: outcome.chargeState,
      outcome,
    };
  });
}

function sepoliaEvidence() {
  return {
    schemaVersion: "1",
    capturedAt: "2026-07-20T00:00:00.000Z",
    commit: "a".repeat(40),
    network: "eip155:84532",
    releaseId: `rel_${"b".repeat(64)}`,
    passed: 12,
    failed: 0,
    walletSpendDelta: "40000",
    payeeBalanceDelta: "40000",
    scenarios: scenarioEvidence(),
  };
}

describe("Mainnet evidence validation", () => {
  test("accepts a complete independently verified Sepolia report", () => {
    expect(() => validateSepoliaEvidence(sepoliaEvidence())).not.toThrow();
  });

  test.each([
    [
      "wrong network",
      (report) => {
        report.network = "eip155:8453";
      },
      "SEPOLIA_GATE_NOT_PASSED",
    ],
    [
      "altered scenario outcome",
      (report) => {
        report.scenarios[0].outcome.executionCount = 2;
      },
      "SEPOLIA_SCENARIO_EVIDENCE_INVALID",
    ],
    [
      "duplicate invocation",
      (report) => {
        report.scenarios[6].invocationId = report.scenarios[0].invocationId;
      },
      "SEPOLIA_INVOCATION_EVIDENCE_DUPLICATE",
    ],
    [
      "duplicate transaction",
      (report) => {
        report.scenarios[6].transactionHash =
          report.scenarios[0].transactionHash;
      },
      "SEPOLIA_PAYMENT_EVIDENCE_DUPLICATE",
    ],
    [
      "transaction on a zero-charge scenario",
      (report) => {
        report.scenarios[1].transactionHash = `0x${"f".repeat(64)}`;
      },
      "SEPOLIA_ZERO_CHARGE_EVIDENCE_INVALID",
    ],
    [
      "wrong balance delta",
      (report) => {
        report.payeeBalanceDelta = "30000";
      },
      "SEPOLIA_BALANCE_EVIDENCE_INVALID",
    ],
  ])("rejects %s", (_name, mutate, code) => {
    const report = sepoliaEvidence();
    mutate(report);
    expect(() => validateSepoliaEvidence(report)).toThrow(code);
  });

  test("rejects duplicated security gate names", () => {
    expect(() =>
      validateSecurityEvidence({
        passed: 8,
        failed: 0,
        gates: Array(8).fill("bundle-scan"),
      }),
    ).toThrow("SECURITY_GATE_NOT_PASSED");
  });

  test("rejects a simulated scenario whose expected and actual agree on a forged value", () => {
    const results = Object.entries(expectedScenarios).map(([name, values]) => {
      const outcome = expectedOutcome(values);
      return { name, expected: outcome, actual: { ...outcome }, passed: true };
    });
    results[0].expected.executionCount = 2;
    results[0].actual.executionCount = 2;
    expect(() =>
      validateSimulatedEvidence({ passed: 12, failed: 0, results }),
    ).toThrow("SIMULATED_GATE_NOT_PASSED");
  });

  test.each([
    [
      "untracked Sepolia evidence",
      { trackedStatus: 1 },
      "SEPOLIA_EVIDENCE_NOT_TRACKED",
    ],
    [
      "a tested commit outside the candidate history",
      { ancestorStatus: 1 },
      "SEPOLIA_TESTED_COMMIT_NOT_ANCESTOR",
    ],
    [
      "a failed history diff",
      { changesStatus: 1 },
      "NON_EVIDENCE_CHANGE_AFTER_SEPOLIA_GATE",
    ],
    [
      "a history without the committed Sepolia report",
      { changedPaths: ["artifacts/release-evidence.json"] },
      "NON_EVIDENCE_CHANGE_AFTER_SEPOLIA_GATE",
    ],
    [
      "a source change after the Sepolia run",
      {
        changedPaths: [
          "artifacts/e2e-sepolia.json",
          "packages/cli/src/index.ts",
        ],
      },
      "NON_EVIDENCE_CHANGE_AFTER_SEPOLIA_GATE",
    ],
  ])("rejects %s", (_name, overrides, code) => {
    expect(() =>
      validateEvidenceLineage({
        trackedStatus: 0,
        ancestorStatus: 0,
        changesStatus: 0,
        changedPaths: ["artifacts/e2e-sepolia.json"],
        ...overrides,
      }),
    ).toThrow(code);
  });

  test("accepts evidence-only descendants of the tested commit", () => {
    expect(() =>
      validateEvidenceLineage({
        trackedStatus: 0,
        ancestorStatus: 0,
        changesStatus: 0,
        changedPaths: [
          "artifacts/e2e-sepolia.json",
          "artifacts/release-evidence.json",
          "docs/acceptance/m7-sepolia.md",
        ],
      }),
    ).not.toThrow();
  });
});
