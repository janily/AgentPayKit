import { test } from "vitest";
import { assertScenario } from "./assert-scenario";
test("stops when wallet refuses", () => assertScenario("wallet-rejected"));
