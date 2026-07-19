import type { ResearchResult } from "./types";

export type SuccessPolicyReason =
  | "SUCCESS"
  | "INVALID_OUTPUT_SCHEMA"
  | "REPORT_TOO_SHORT"
  | "INSUFFICIENT_CITATIONS"
  | "INVALID_CITATION"
  | "HARD_CAP_VIOLATION";

export function evaluateResearchSuccess(value: unknown): {
  success: boolean;
  reason: SuccessPolicyReason;
} {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("report" in value) ||
    typeof value.report !== "string" ||
    !("citations" in value) ||
    !Array.isArray(value.citations) ||
    !("telemetry" in value) ||
    typeof value.telemetry !== "object" ||
    value.telemetry === null
  ) {
    return { success: false, reason: "INVALID_OUTPUT_SCHEMA" };
  }
  const result = value as ResearchResult;
  if (result.report.replace(/\s/g, "").length < 500) {
    return { success: false, reason: "REPORT_TOO_SHORT" };
  }
  if (
    !result.citations.every(
      (url) => typeof url === "string" && url.startsWith("https://"),
    )
  ) {
    return { success: false, reason: "INVALID_CITATION" };
  }
  if (new Set(result.citations).size < 2) {
    return { success: false, reason: "INSUFFICIENT_CITATIONS" };
  }
  const telemetry = result.telemetry;
  if (
    telemetry.searches > 5 ||
    telemetry.pages > 5 ||
    telemetry.outputTokens > 3_000 ||
    telemetry.durationMs > 300_000 ||
    telemetry.developerReportedCostUsd > 0.5 ||
    !Array.isArray(telemetry.processors) ||
    telemetry.processors.length !== 2
  ) {
    return { success: false, reason: "HARD_CAP_VIOLATION" };
  }
  return { success: true, reason: "SUCCESS" };
}

export async function settleSuccessfulResearch(
  result: unknown,
  settle: () => Promise<void>,
): Promise<ReturnType<typeof evaluateResearchSuccess>> {
  const decision = evaluateResearchSuccess(result);
  if (decision.success) await settle();
  return decision;
}
