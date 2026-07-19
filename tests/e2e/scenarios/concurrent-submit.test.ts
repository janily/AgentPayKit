import { test } from "vitest";
import { assertScenario } from "./assert-scenario";
test("deduplicates concurrent submit", () =>
  assertScenario("concurrent-submit"));
