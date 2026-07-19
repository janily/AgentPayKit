declare const brand: unique symbol;
type Brand<Value, Name extends string> = Value & { readonly [brand]: Name };

export type ReleaseId = Brand<string, "ReleaseId">;
export type InputDigest = Brand<string, "InputDigest">;
export type PackageDigest = Brand<string, "PackageDigest">;
export type PublisherId = Brand<string, "PublisherId">;
export type InvocationId = Brand<string, "InvocationId">;
export type QuoteId = Brand<string, "QuoteId">;
export type TraceId = Brand<string, "TraceId">;

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const RELEASE = /^rel_[0-9a-f]{64}$/;
const PUBLISHER = /^0x[0-9a-fA-F]{40}$/;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function parseId<Name extends string>(
  value: unknown,
  name: Name,
  pattern: RegExp,
): Brand<string, Name> {
  if (typeof value !== "string" || !pattern.test(value))
    throw new TypeError(`invalid ${name}`);
  return value as Brand<string, Name>;
}

export const parseReleaseId = (value: unknown): ReleaseId =>
  parseId(value, "ReleaseId", RELEASE);
export const parseInputDigest = (value: unknown): InputDigest =>
  parseId(value, "InputDigest", DIGEST);
export const parsePackageDigest = (value: unknown): PackageDigest =>
  parseId(value, "PackageDigest", DIGEST);
export const parsePublisherId = (value: unknown): PublisherId =>
  parseId(value, "PublisherId", PUBLISHER);
export const parseInvocationId = (value: unknown): InvocationId =>
  parseId(
    value,
    "InvocationId",
    new RegExp(`^inv_${ULID.source.slice(1, -1)}$`),
  );
export const parseQuoteId = (value: unknown): QuoteId =>
  parseId(value, "QuoteId", new RegExp(`^qte_${ULID.source.slice(1, -1)}$`));
export const parseTraceId = (value: unknown): TraceId =>
  parseId(value, "TraceId", new RegExp(`^trc_${ULID.source.slice(1, -1)}$`));
