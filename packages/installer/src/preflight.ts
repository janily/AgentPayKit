export class InstallError extends Error {
  constructor(
    public readonly code: string,
    public readonly remediation?: string,
  ) {
    super(code);
    this.name = "InstallError";
  }
}

export function macosPreflight(platform: NodeJS.Platform): void {
  if (platform !== "darwin") throw new InstallError("UNSUPPORTED_PLATFORM");
}
