export interface SpendSummary {
  limit: string;
  spent: string;
  held: string;
  available: string;
}

export async function spendCommand(
  read: () => Promise<SpendSummary>,
): Promise<SpendSummary> {
  return read();
}
