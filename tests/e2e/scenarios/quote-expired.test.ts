import { test } from "vitest";
import { assertScenario } from "./assert-scenario";
test("rejects an expired quote", () => assertScenario("quote-expired"));
