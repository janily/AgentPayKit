import { test } from "vitest";
import { assertScenario } from "./assert-scenario";
test("fails without charge on handler timeout", () =>
  assertScenario("handler-timeout"));
