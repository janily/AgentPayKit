import { test } from "vitest";
import { assertScenario } from "./assert-scenario";
test("rejects invalid data without charge", () =>
  assertScenario("data-rejected"));
