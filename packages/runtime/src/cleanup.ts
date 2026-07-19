interface CleanupRepository {
  listStaleInputs(
    cutoff: string,
  ): Promise<Array<{ id: string; inputBlobKey: string }>>;
  listExpiredResults(now: string): Promise<
    Array<{
      id: string;
      version: number;
      resultBlobKey?: string;
      candidateResultBlobKey?: string;
    }>
  >;
  listExpiredMetadata(
    now: string,
  ): Promise<Array<{ id: string; quoteId: string; blobKeys: string[] }>>;
  markInputDeleted(invocationId: string, now: string): Promise<void>;
  transition(input: {
    id: string;
    from: "RESULT_AVAILABLE";
    to: "RESULT_EXPIRED";
    expectedVersion: number;
    now: string;
  }): Promise<boolean>;
  deleteInvocationMetadata(
    invocationId: string,
    quoteId: string,
  ): Promise<void>;
}

interface CleanupVault {
  delete(key: string): Promise<unknown>;
}

export interface CleanupSummary {
  inputsDeleted: number;
  resultsExpired: number;
  metadataDeleted: number;
}

export class RuntimeCleanupService {
  constructor(
    private readonly options: {
      repository: CleanupRepository;
      vault: CleanupVault;
      now: () => Date;
    },
  ) {}

  async run(): Promise<CleanupSummary> {
    const now = this.options.now();
    const nowIso = now.toISOString();
    const inputCutoff = new Date(now.getTime() - 60 * 60_000).toISOString();
    const summary: CleanupSummary = {
      inputsDeleted: 0,
      resultsExpired: 0,
      metadataDeleted: 0,
    };

    for (const input of await this.options.repository.listStaleInputs(
      inputCutoff,
    )) {
      await this.options.vault.delete(input.inputBlobKey);
      await this.options.repository.markInputDeleted(input.id, nowIso);
      summary.inputsDeleted += 1;
    }

    for (const result of await this.options.repository.listExpiredResults(
      nowIso,
    )) {
      const claimed = await this.options.repository.transition({
        id: result.id,
        from: "RESULT_AVAILABLE",
        to: "RESULT_EXPIRED",
        expectedVersion: result.version,
        now: nowIso,
      });
      if (!claimed) continue;
      const keys = new Set(
        [result.resultBlobKey, result.candidateResultBlobKey].filter(
          (key): key is string => typeof key === "string",
        ),
      );
      for (const key of keys) await this.options.vault.delete(key);
      summary.resultsExpired += 1;
    }

    for (const metadata of await this.options.repository.listExpiredMetadata(
      nowIso,
    )) {
      for (const key of new Set(metadata.blobKeys)) {
        await this.options.vault.delete(key);
      }
      await this.options.repository.deleteInvocationMetadata(
        metadata.id,
        metadata.quoteId,
      );
      summary.metadataDeleted += 1;
    }

    return summary;
  }
}
