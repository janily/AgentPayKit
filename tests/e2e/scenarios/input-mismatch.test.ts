import { test } from "vitest";
import { assertScenario } from "./assert-scenario";
test("rejects input digest mismatch", () => assertScenario("input-mismatch"));
