import { test } from "vitest";
import { assertScenario } from "./assert-scenario";
test("stops on insufficient balance", () =>
  assertScenario("insufficient-balance"));
