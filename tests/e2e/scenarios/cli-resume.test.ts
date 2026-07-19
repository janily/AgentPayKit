import { test } from "vitest";
import { assertScenario } from "./assert-scenario";
test("CLI resume returns the recovered result", () =>
  assertScenario("cli-resume"));
