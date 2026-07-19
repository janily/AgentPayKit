import { expect } from "vitest";

import { runScenario, scenarios, type ScenarioName } from "./runner";

export async function assertScenario(name: ScenarioName): Promise<void> {
  expect(await runScenario(name)).toEqual(scenarios[name].expected);
}
