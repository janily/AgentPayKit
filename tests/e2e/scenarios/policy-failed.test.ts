import { test } from "vitest";
import { assertScenario } from "./assert-scenario";
test("fails without charge on policy rejection", () =>
  assertScenario("policy-failed"));
