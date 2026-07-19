import { redactLogEvent } from "./redaction";

export class AllowlistedLogger {
  constructor(private readonly write: (line: string) => void) {}

  emit(input: unknown): void {
    this.write(JSON.stringify(redactLogEvent(input)));
  }
}
