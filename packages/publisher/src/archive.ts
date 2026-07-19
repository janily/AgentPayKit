export interface ArchiveEntry {
  path: string;
  bytes: Uint8Array;
  mode?: number;
}

function field(
  target: Uint8Array,
  offset: number,
  length: number,
  value: string,
): void {
  target.set(new TextEncoder().encode(value).slice(0, length), offset);
}

function octal(value: number, length: number): string {
  return value.toString(8).padStart(length - 1, "0") + "\0";
}

export function deterministicTar(entries: ArchiveEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const entry of [...entries].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    if (
      entry.path.startsWith("/") ||
      entry.path.split("/").includes("..") ||
      entry.path.length > 100
    ) {
      throw new Error("UNSAFE_ARCHIVE_PATH");
    }
    const header = new Uint8Array(512);
    field(header, 0, 100, entry.path);
    field(header, 100, 8, octal(entry.mode ?? 0o644, 8));
    field(header, 108, 8, octal(0, 8));
    field(header, 116, 8, octal(0, 8));
    field(header, 124, 12, octal(entry.bytes.byteLength, 12));
    field(header, 136, 12, octal(0, 12));
    header.fill(0x20, 148, 156);
    header[156] = "0".charCodeAt(0);
    field(header, 257, 6, "ustar\0");
    field(header, 263, 2, "00");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    field(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
    chunks.push(header, entry.bytes);
    const padding = (512 - (entry.bytes.byteLength % 512)) % 512;
    if (padding) chunks.push(new Uint8Array(padding));
  }
  chunks.push(new Uint8Array(1024));
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function string(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes).replace(/\0.*$/s, "");
}

export function readDeterministicTar(bytes: Uint8Array): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  let offset = 0;
  while (offset + 512 <= bytes.byteLength) {
    const header = bytes.slice(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const path = string(header.slice(0, 100));
    const size = Number.parseInt(string(header.slice(124, 136)).trim(), 8);
    if (!path || !Number.isSafeInteger(size))
      throw new Error("INVALID_ARCHIVE");
    offset += 512;
    entries.push({
      path,
      bytes: bytes.slice(offset, offset + size),
      mode: 0o644,
    });
    offset += Math.ceil(size / 512) * 512;
  }
  return entries;
}
