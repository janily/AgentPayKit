export function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export function required(value: string | undefined, code: string): string {
  if (!value) throw Object.assign(new Error(code), { code });
  return value;
}

export function record(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw Object.assign(new Error(code), { code });
  }
  return value as Record<string, unknown>;
}
