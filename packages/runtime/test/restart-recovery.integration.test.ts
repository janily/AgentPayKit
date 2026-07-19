import { readFile, readdir } from "node:fs/promises";

import { Miniflare } from "miniflare";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RuntimeCleanupService } from "../src/cleanup";
import { InvocationQueueConsumer } from "../src/queue-consumer";
import { ReceiptService } from "../src/receipt-service";
import { ReconciliationService } from "../src/reconciliation";
import { RecoveryService } from "../src/recovery-service";
import { D1InvocationRepository } from "../src/repository";

const invocationId = "inv_01J00000000000000000000000";
const quoteId = "qte_01J00000000000000000000000";
const releaseId = `rel_${"a".repeat(64)}`;
const inputDigest = `sha256:${"b".repeat(64)}`;
const transactionHash = `0x${"f".repeat(64)}` as const;
const signature = {
  algorithm: "Ed25519" as const,
  keyId: "runtime-test-key",
  value:
    "ErhqhgkFO7YARTK-G4Cc2qNmiKQkPL-4IlFlKQ2LNocZEy07QleUYM0dVVB2hyIZF2kvYbmc1IsXLqJ6VWJhCg",
};

const miniflareOptions = {
  compatibilityDate: "2026-07-19",
  d1Databases: { DB: "agentpaykit-restart-test" },
  modules: true as const,
  script: 'export default { fetch() { return new Response("ok") } }',
};

describe("Miniflare settlement recovery", () => {
  let miniflare: Miniflare | undefined;

  afterEach(async () => {
    await miniflare?.dispose();
  });

  test("survives restart and queue redelivery, reconciles timeout, then expires result", async () => {
    miniflare = new Miniflare(miniflareOptions);
    const database = await miniflare.getD1Database("DB");
    const migrationsUrl = new URL("../migrations/", import.meta.url);
    for (const filename of (await readdir(migrationsUrl)).sort()) {
      const migration = await readFile(
        new URL(filename, migrationsUrl),
        "utf8",
      );
      for (const statement of migration
        .split(";")
        .map((value) => value.trim())
        .filter(Boolean)) {
        await database.prepare(statement).run();
      }
    }
    const repository = new D1InvocationRepository(database);
    await repository.createRelease({
      id: releaseId,
      packageDigest: `sha256:${"c".repeat(64)}`,
      publisherId: `0x${"1".repeat(40)}`,
      network: "eip155:84532",
      environment: "testnet",
      amount: "10000",
      asset: `0x${"2".repeat(40)}`,
      payee: `0x${"3".repeat(40)}`,
      maximumExecutionMs: 30_000,
      now: "2026-07-19T00:00:00.000Z",
    });
    await repository.createQuote({
      id: quoteId,
      invocationId,
      releaseId,
      inputDigest,
      environment: "testnet",
      expiresAt: "2026-07-19T00:05:00.000Z",
      now: "2026-07-19T00:00:00.000Z",
    });
    await repository.createOrGetInvocation({
      id: invocationId,
      quoteId,
      releaseId,
      inputDigest,
      requestFingerprint: `sha256:${"d".repeat(64)}`,
      inputBlobKey: "input",
      inputBlobDigest: `sha256:${"e".repeat(64)}`,
      paymentBlobKey: "payment",
      paymentBlobDigest: `sha256:${"4".repeat(64)}`,
      traceId: "trc_01J00000000000000000000000",
      now: "2026-07-19T00:00:00.000Z",
    });
    await repository.transition({
      id: invocationId,
      from: "PAYMENT_VERIFIED",
      to: "QUEUED",
      expectedVersion: 0,
      now: "2026-07-19T00:00:01.000Z",
    });

    const blobs = new Map<string, unknown>([
      ["input", { prompt: "research" }],
      [
        "payment",
        {
          schemaVersion: "1",
          paymentPayload: {},
          paymentRequirements: {},
        },
      ],
    ]);
    const vault = {
      getJson: vi.fn(async (key: string) => blobs.get(key)),
      putJson: vi.fn(async (key: string, value: unknown) => {
        blobs.set(key, value);
        return { key, digest: `sha256:${"9".repeat(64)}` };
      }),
      delete: vi.fn(async (key: string) => {
        blobs.delete(key);
      }),
    };
    const receipts = new ReceiptService({
      vault,
      signer: { sign: vi.fn(async () => signature) },
    });
    const common = {
      releases: { get: (id: string) => repository.getRelease(id) },
      vault,
      handler: { run: vi.fn(async () => ({ answer: "complete" })) },
      policy: { evaluate: vi.fn(async () => ({ accepted: true as const })) },
      receipts,
      now: () => new Date("2026-07-19T00:02:00.000Z"),
    };
    const timedOut = new InvocationQueueConsumer({
      repository,
      ...common,
      settlement: {
        settle: vi.fn(async () => ({ state: "SETTLEMENT_UNKNOWN" as const })),
      },
      reconciliation: { reconcile: vi.fn() },
    });

    await expect(
      timedOut.process({ invocationId, expectedVersion: 1 }),
    ).resolves.toBe("processed");
    await expect(repository.getInvocation(invocationId)).resolves.toMatchObject(
      {
        status: "SETTLEMENT_UNKNOWN",
        chargeState: "SETTLEMENT_UNKNOWN",
      },
    );

    const restartedRepository = new D1InvocationRepository(
      await miniflare.getD1Database("DB"),
    );
    const reconciliation = new ReconciliationService({
      repository: restartedRepository,
      vault,
      payment: {
        reconcile: vi.fn(async () => ({
          state: "CHARGED" as const,
          transactionHash,
          payer: `0x${"1".repeat(40)}` as const,
          payee: `0x${"3".repeat(40)}` as const,
          network: "eip155:84532" as const,
          asset: `0x${"2".repeat(40)}` as const,
          amount: "10000",
          confirmedAt: "2026-07-19T00:03:00.000Z",
        })),
      },
      receipts,
      now: () => new Date("2026-07-19T00:03:00.000Z"),
    });
    const redelivered = new InvocationQueueConsumer({
      repository: restartedRepository,
      ...common,
      releases: { get: (id: string) => restartedRepository.getRelease(id) },
      settlement: { settle: vi.fn() },
      reconciliation,
    });

    await expect(
      redelivered.process({ invocationId, expectedVersion: 1 }),
    ).resolves.toBe("reconcile");
    await expect(
      redelivered.process({ invocationId, expectedVersion: 1 }),
    ).resolves.toBe("duplicate");
    await expect(
      restartedRepository.getInvocation(invocationId),
    ).resolves.toMatchObject({
      status: "RESULT_AVAILABLE",
      chargeState: "CHARGED",
    });

    const cleanup = new RuntimeCleanupService({
      repository: restartedRepository,
      vault,
      now: () => new Date("2026-07-20T00:03:00.000Z"),
    });
    await expect(cleanup.run()).resolves.toMatchObject({ resultsExpired: 1 });

    const recovery = new RecoveryService({
      repository: restartedRepository,
      vault,
      signer: { sign: vi.fn(async () => signature) },
    });
    await expect(recovery.result(invocationId)).rejects.toMatchObject({
      code: "RESULT_EXPIRED",
      status: 410,
    });
    await expect(recovery.receipt(invocationId)).resolves.toMatchObject({
      payload: { invocationId, transactionHash },
    });
  });
});
