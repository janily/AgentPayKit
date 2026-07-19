import { test } from "vitest";
import { assertScenario } from "./assert-scenario";
test("stops on wrong network", () => assertScenario("wrong-network"));
