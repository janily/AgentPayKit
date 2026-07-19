import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { assertScenario } from "./assert-scenario";
import { buildReport } from "./runner";

describe("happy path", () => {
  test("charges once and exposes the result", async () => {
    await assertScenario("happy-path");
    const report = await buildReport();
    if (process.env.AGENTPAY_UPDATE_E2E_REPORT === "1") {
      await writeFile(
        "artifacts/e2e-simulated.json",
        `${JSON.stringify(report, null, 2)}\n`,
      );
    }
    const committed = JSON.parse(
      await readFile("artifacts/e2e-simulated.json", "utf8"),
    );
    expect(report).toEqual(committed);
  });
});
