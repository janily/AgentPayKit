export const expectedScenarios = {
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

const evidenceOnlyPaths = new Set([
  "artifacts/e2e-sepolia.json",
  "artifacts/release-evidence.json",
  "docs/acceptance/m7-sepolia.md",
]);

export function evidenceFailure(code) {
  throw new Error(`${code}. No transaction was broadcast.`);
}

export function expectedOutcome(values) {
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

export function validateSimulatedEvidence(simulated) {
  if (
    simulated?.passed !== 12 ||
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
    evidenceFailure("SIMULATED_GATE_NOT_PASSED");
  }
}

export function validateSecurityEvidence(security) {
  if (
    security?.passed !== 8 ||
    security.failed !== 0 ||
    !Array.isArray(security.gates) ||
    security.gates.length !== 8 ||
    new Set(security.gates).size !== 8
  ) {
    evidenceFailure("SECURITY_GATE_NOT_PASSED");
  }
}

export function validateEvidenceLineage({
  trackedStatus,
  ancestorStatus,
  changesStatus,
  changedPaths,
}) {
  if (trackedStatus !== 0) {
    evidenceFailure("SEPOLIA_EVIDENCE_NOT_TRACKED");
  }
  if (ancestorStatus !== 0) {
    evidenceFailure("SEPOLIA_TESTED_COMMIT_NOT_ANCESTOR");
  }
  if (
    changesStatus !== 0 ||
    !Array.isArray(changedPaths) ||
    !changedPaths.includes("artifacts/e2e-sepolia.json") ||
    changedPaths.some((path) => !evidenceOnlyPaths.has(path))
  ) {
    evidenceFailure("NON_EVIDENCE_CHANGE_AFTER_SEPOLIA_GATE");
  }
}

export function validateSepoliaEvidence(sepolia) {
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
    evidenceFailure("SEPOLIA_GATE_NOT_PASSED");
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
      evidenceFailure("SEPOLIA_SCENARIO_EVIDENCE_INVALID");
    }
    if (
      scenario.mode === "chain" &&
      !/^inv_[0-9A-HJKMNP-TV-Z]{26}$/.test(scenario.invocationId ?? "")
    ) {
      evidenceFailure("SEPOLIA_INVOCATION_EVIDENCE_INVALID");
    }
    if (scenario.mode === "chain") {
      if (invocationIds.has(scenario.invocationId)) {
        evidenceFailure("SEPOLIA_INVOCATION_EVIDENCE_DUPLICATE");
      }
      invocationIds.add(scenario.invocationId);
    }
    if (expected.transferCount === 1) {
      if (
        !/^0x[0-9a-fA-F]{64}$/.test(scenario.transactionHash ?? "") ||
        !/^0x[0-9a-fA-F]+$/.test(scenario.blockNumber ?? "") ||
        !/^sha256:[0-9a-f]{64}$/.test(scenario.receiptDigest ?? "")
      ) {
        evidenceFailure("SEPOLIA_PAYMENT_EVIDENCE_INVALID");
      }
      const transactionHash = scenario.transactionHash.toLowerCase();
      if (
        transactionHashes.has(transactionHash) ||
        receiptDigests.has(scenario.receiptDigest)
      ) {
        evidenceFailure("SEPOLIA_PAYMENT_EVIDENCE_DUPLICATE");
      }
      transactionHashes.add(transactionHash);
      receiptDigests.add(scenario.receiptDigest);
    } else if (scenario.transactionHash || scenario.receiptDigest) {
      evidenceFailure("SEPOLIA_ZERO_CHARGE_EVIDENCE_INVALID");
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
    evidenceFailure("SEPOLIA_BALANCE_EVIDENCE_INVALID");
  }
}
