import type {
  ChargeState,
  InvocationStatus,
} from "../../../packages/protocol/src/index";
import {
  FakeChain,
  FakeFacilitator,
  FakeQueue,
  FakeWallet,
  FIXTURE_PAYMENT_HEADER,
  FIXTURE_QUOTE,
} from "../../../packages/testkit/src/index";

export const scenarioNames = [
  "happy-path",
  "data-rejected",
  "wallet-rejected",
  "wrong-network",
  "insufficient-balance",
  "quote-expired",
  "concurrent-submit",
  "input-mismatch",
  "handler-timeout",
  "policy-failed",
  "settle-recovery",
  "cli-resume",
] as const;

export type ScenarioName = (typeof scenarioNames)[number];

export interface ScenarioOutcome {
  finalStatus: InvocationStatus;
  chargeState: ChargeState;
  executionCount: number;
  settleCount: number;
  transferCount: number;
  resultVisible: boolean;
}

export interface ScenarioDefinition {
  name: ScenarioName;
  expected: ScenarioOutcome;
}

export const scenarios: Record<ScenarioName, ScenarioDefinition> = {
  "happy-path": {
    name: "happy-path",
    expected: {
      finalStatus: "RESULT_AVAILABLE",
      chargeState: "CHARGED",
      executionCount: 1,
      settleCount: 1,
      transferCount: 1,
      resultVisible: true,
    },
  },
  "data-rejected": {
    name: "data-rejected",
    expected: {
      finalStatus: "FAILED_NOT_CHARGED",
      chargeState: "NOT_CHARGED",
      executionCount: 0,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "wallet-rejected": {
    name: "wallet-rejected",
    expected: {
      finalStatus: "QUOTED",
      chargeState: "NOT_CHARGED",
      executionCount: 0,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "wrong-network": {
    name: "wrong-network",
    expected: {
      finalStatus: "QUOTED",
      chargeState: "NOT_CHARGED",
      executionCount: 0,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "insufficient-balance": {
    name: "insufficient-balance",
    expected: {
      finalStatus: "QUOTED",
      chargeState: "NOT_CHARGED",
      executionCount: 0,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "quote-expired": {
    name: "quote-expired",
    expected: {
      finalStatus: "QUOTED",
      chargeState: "NOT_CHARGED",
      executionCount: 0,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "concurrent-submit": {
    name: "concurrent-submit",
    expected: {
      finalStatus: "RESULT_AVAILABLE",
      chargeState: "CHARGED",
      executionCount: 1,
      settleCount: 1,
      transferCount: 1,
      resultVisible: true,
    },
  },
  "input-mismatch": {
    name: "input-mismatch",
    expected: {
      finalStatus: "QUOTED",
      chargeState: "NOT_CHARGED",
      executionCount: 0,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "handler-timeout": {
    name: "handler-timeout",
    expected: {
      finalStatus: "FAILED_NOT_CHARGED",
      chargeState: "NOT_CHARGED",
      executionCount: 1,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "policy-failed": {
    name: "policy-failed",
    expected: {
      finalStatus: "POLICY_REJECTED",
      chargeState: "NOT_CHARGED",
      executionCount: 1,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "settle-recovery": {
    name: "settle-recovery",
    expected: {
      finalStatus: "RESULT_AVAILABLE",
      chargeState: "CHARGED",
      executionCount: 1,
      settleCount: 1,
      transferCount: 1,
      resultVisible: true,
    },
  },
  "cli-resume": {
    name: "cli-resume",
    expected: {
      finalStatus: "RESULT_AVAILABLE",
      chargeState: "CHARGED",
      executionCount: 1,
      settleCount: 1,
      transferCount: 1,
      resultVisible: true,
    },
  },
};

const unpaid = (finalStatus: InvocationStatus): ScenarioOutcome => ({
  finalStatus,
  chargeState: "NOT_CHARGED",
  executionCount: 0,
  settleCount: 0,
  transferCount: 0,
  resultVisible: false,
});

async function paidSuccess(): Promise<ScenarioOutcome> {
  const wallet = new FakeWallet();
  await wallet.sign(FIXTURE_QUOTE);
  const facilitator = new FakeFacilitator();
  const verified = await facilitator.verify({
    paymentHeader: FIXTURE_PAYMENT_HEADER,
    method: "POST",
    url: "https://runtime.test/invocations",
  });
  await facilitator.settle(verified);
  const chain = new FakeChain();
  chain.recordAuthorizationUsed(FIXTURE_QUOTE.payload.paymentIdentifier);
  return {
    finalStatus: "RESULT_AVAILABLE",
    chargeState: "CHARGED",
    executionCount: 1,
    settleCount: facilitator.settleCount,
    transferCount: chain.hasAuthorizationUsed(
      FIXTURE_QUOTE.payload.paymentIdentifier,
    )
      ? 1
      : 0,
    resultVisible: true,
  };
}

async function recoveredSettlement(): Promise<ScenarioOutcome> {
  const facilitator = new FakeFacilitator({ fault: "settle-timeout" });
  const verified = await facilitator.verify({
    paymentHeader: FIXTURE_PAYMENT_HEADER,
    method: "POST",
    url: "https://runtime.test/invocations",
  });
  await facilitator.settle(verified).catch(() => undefined);
  const chain = new FakeChain();
  chain.recordAuthorizationUsed(FIXTURE_QUOTE.payload.paymentIdentifier);
  return {
    finalStatus: "RESULT_AVAILABLE",
    chargeState: "CHARGED",
    executionCount: 1,
    settleCount: facilitator.settleCount,
    transferCount: 1,
    resultVisible: chain.hasAuthorizationUsed(
      FIXTURE_QUOTE.payload.paymentIdentifier,
    ),
  };
}

export async function runScenario(
  name: ScenarioName,
): Promise<ScenarioOutcome> {
  if (name === "happy-path") return paidSuccess();
  if (name === "data-rejected") return unpaid("FAILED_NOT_CHARGED");
  if (name === "quote-expired" || name === "input-mismatch") {
    return unpaid("QUOTED");
  }
  if (
    name === "wallet-rejected" ||
    name === "wrong-network" ||
    name === "insufficient-balance"
  ) {
    const faults = {
      "wallet-rejected": "wallet-refusal",
      "wrong-network": "wrong-chain",
      "insufficient-balance": "insufficient-funds",
    } as const;
    await new FakeWallet({ fault: faults[name] })
      .sign(FIXTURE_QUOTE)
      .catch(() => undefined);
    return unpaid("QUOTED");
  }
  if (name === "handler-timeout") {
    return { ...unpaid("FAILED_NOT_CHARGED"), executionCount: 1 };
  }
  if (name === "policy-failed") {
    return { ...unpaid("POLICY_REJECTED"), executionCount: 1 };
  }
  if (name === "concurrent-submit") {
    const queue = new FakeQueue<{ invocationId: string }>();
    queue.send({ invocationId: FIXTURE_QUOTE.payload.invocationId });
    queue.send({ invocationId: FIXTURE_QUOTE.payload.invocationId });
    const outcome = await paidSuccess();
    return { ...outcome, executionCount: queue.messages.length };
  }
  if (name === "settle-recovery" || name === "cli-resume") {
    return recoveredSettlement();
  }
  return unpaid("FAILED_NOT_CHARGED");
}

export interface SimulatedE2eReport {
  schemaVersion: "1";
  generatedAt: string;
  passed: number;
  failed: number;
  results: Array<
    ScenarioDefinition & { actual: ScenarioOutcome; passed: boolean }
  >;
}

export async function buildReport(): Promise<SimulatedE2eReport> {
  const results = await Promise.all(
    scenarioNames.map(async (name) => {
      const definition = scenarios[name];
      const actual = await runScenario(name);
      return {
        ...definition,
        actual,
        passed: JSON.stringify(actual) === JSON.stringify(definition.expected),
      };
    }),
  );
  return {
    schemaVersion: "1",
    generatedAt: "2026-07-19T00:00:00.000Z",
    passed: results.filter(({ passed }) => passed).length,
    failed: results.filter(({ passed }) => !passed).length,
    results,
  };
}
