import { ResearchHandlerError } from "./budget";

export async function safeRetry<Value>(
  operation: () => Promise<Value>,
): Promise<Value> {
  try {
    return await operation();
  } catch {
    try {
      return await operation();
    } catch {
      throw new ResearchHandlerError("PROVIDER_REQUEST_FAILED");
    }
  }
}
