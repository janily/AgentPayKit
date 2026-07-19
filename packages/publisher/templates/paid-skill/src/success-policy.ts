export function isSuccessful(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "summary" in result &&
    typeof result.summary === "string" &&
    result.summary.length > 0
  );
}
