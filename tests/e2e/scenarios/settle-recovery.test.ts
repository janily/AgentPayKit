import { test } from "vitest";
import { assertScenario } from "./assert-scenario";
test("recovers unknown settlement without a duplicate", () =>
  assertScenario("settle-recovery"));
