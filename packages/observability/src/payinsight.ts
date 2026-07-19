export interface PayInsightRecord {
  releaseId: string;
  status: string;
  amount: string;
  developerReportedCostUsd: number;
  chargeState: "NOT_CHARGED" | "CHARGED" | "SETTLEMENT_UNKNOWN";
  occurredAt: string;
}

export interface PayInsightFilter {
  releaseId?: string;
  status?: string;
  from?: string;
  to?: string;
}

export const payInsightD1Query = `SELECT release_id, status, COUNT(*) AS invocation_count,
SUM(CAST(amount AS INTEGER)) AS gross_amount,
SUM(developer_reported_cost_usd) AS developer_reported_cost_usd
FROM invocation_insights
WHERE publisher_id = ? AND occurred_at >= ? AND occurred_at < ?
GROUP BY release_id, status`;

export function aggregatePayInsight(input: {
  authorized: boolean;
  records: PayInsightRecord[];
  filter?: PayInsightFilter;
}) {
  if (!input.authorized)
    throw Object.assign(new Error("PUBLISHER_IDENTITY_REQUIRED"), {
      code: "PUBLISHER_IDENTITY_REQUIRED",
    });
  const records = input.records.filter((record) => {
    const filter = input.filter;
    return (
      (!filter?.releaseId || record.releaseId === filter.releaseId) &&
      (!filter?.status || record.status === filter.status) &&
      (!filter?.from || record.occurredAt >= filter.from) &&
      (!filter?.to || record.occurredAt < filter.to)
    );
  });
  return {
    invocationCount: records.length,
    grossAmount: records
      .reduce((total, record) => total + BigInt(record.amount), 0n)
      .toString(),
    developerReportedCostUsd: records.reduce(
      (total, record) => total + record.developerReportedCostUsd,
      0,
    ),
    unknownSettlements: records.filter(
      ({ chargeState }) => chargeState === "SETTLEMENT_UNKNOWN",
    ).length,
    resultExpired: records.filter(({ status }) => status === "RESULT_EXPIRED")
      .length,
  };
}
