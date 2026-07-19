import { describe, expect, test, vi } from "vitest";

import { RuntimeCleanupService } from "../src/cleanup";

describe("runtime retention cleanup", () => {
  test("deletes raw input after the one-hour hard limit", async () => {
    const repository = {
      listStaleInputs: vi
        .fn()
        .mockResolvedValue([
          { id: "inv_input", inputBlobKey: "input/inv_input" },
        ]),
      listExpiredResults: vi.fn().mockResolvedValue([]),
      listExpiredMetadata: vi.fn().mockResolvedValue([]),
      markInputDeleted: vi.fn().mockResolvedValue(undefined),
      transition: vi.fn(),
      deleteInvocationMetadata: vi.fn(),
    };
    const vault = { delete: vi.fn().mockResolvedValue(undefined) };
    const service = new RuntimeCleanupService({
      repository,
      vault,
      now: () => new Date("2026-07-19T02:00:00.000Z"),
    });

    await service.run();

    expect(repository.listStaleInputs).toHaveBeenCalledWith(
      "2026-07-19T01:00:00.000Z",
    );
    expect(vault.delete).toHaveBeenCalledWith("input/inv_input");
    expect(repository.markInputDeleted).toHaveBeenCalledWith(
      "inv_input",
      "2026-07-19T02:00:00.000Z",
    );
  });

  test("expires a result after 24 hours while retaining its receipt", async () => {
    const repository = {
      listStaleInputs: vi.fn().mockResolvedValue([]),
      listExpiredResults: vi.fn().mockResolvedValue([
        {
          id: "inv_result",
          version: 8,
          resultBlobKey: "result/inv_result",
          candidateResultBlobKey: "candidate/inv_result",
        },
      ]),
      listExpiredMetadata: vi.fn().mockResolvedValue([]),
      markInputDeleted: vi.fn(),
      transition: vi.fn().mockResolvedValue(true),
      deleteInvocationMetadata: vi.fn(),
    };
    const vault = { delete: vi.fn().mockResolvedValue(undefined) };
    const service = new RuntimeCleanupService({
      repository,
      vault,
      now: () => new Date("2026-07-20T02:00:00.000Z"),
    });

    await service.run();

    expect(vault.delete).toHaveBeenCalledWith("result/inv_result");
    expect(vault.delete).toHaveBeenCalledWith("candidate/inv_result");
    expect(repository.transition).toHaveBeenCalledWith({
      id: "inv_result",
      from: "RESULT_AVAILABLE",
      to: "RESULT_EXPIRED",
      expectedVersion: 8,
      now: "2026-07-20T02:00:00.000Z",
    });
    expect(repository.deleteInvocationMetadata).not.toHaveBeenCalled();
  });

  test("deletes blobs and metadata after 30 days", async () => {
    const repository = {
      listStaleInputs: vi.fn().mockResolvedValue([]),
      listExpiredResults: vi.fn().mockResolvedValue([]),
      listExpiredMetadata: vi.fn().mockResolvedValue([
        {
          id: "inv_metadata",
          quoteId: "qte_metadata",
          blobKeys: [
            "input/inv_metadata",
            "payment/inv_metadata",
            "receipt/inv_metadata",
          ],
        },
      ]),
      markInputDeleted: vi.fn(),
      transition: vi.fn(),
      deleteInvocationMetadata: vi.fn().mockResolvedValue(undefined),
    };
    const vault = { delete: vi.fn().mockResolvedValue(undefined) };
    const service = new RuntimeCleanupService({
      repository,
      vault,
      now: () => new Date("2026-08-19T02:00:00.000Z"),
    });

    await service.run();

    expect(vault.delete).toHaveBeenCalledTimes(3);
    expect(repository.deleteInvocationMetadata).toHaveBeenCalledWith(
      "inv_metadata",
      "qte_metadata",
    );
  });
});
