import { readFile, readdir } from "node:fs/promises";

import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  D1InvocationRepository,
  InvocationBindingConflictError,
} from "../src/repository";

const invocationId = "inv_01J00000000000000000000000";
const quoteId = "qte_01J00000000000000000000000";
const releaseId = `rel_${"a".repeat(64)}`;
const inputDigest = `sha256:${"b".repeat(64)}`;
const baseInvocation = {
  id: invocationId,
  quoteId,
  releaseId,
  inputDigest,
  requestFingerprint: `sha256:${"c".repeat(64)}`,
  inputBlobKey: "encrypted/input/one",
  inputBlobDigest: `sha256:${"1".repeat(64)}`,
  paymentBlobKey: "encrypted/payment/one",
  paymentBlobDigest: `sha256:${"2".repeat(64)}`,
  traceId: "trc_01J00000000000000000000000",
  now: "2026-07-19T00:00:00.000Z",
};

describe("D1 invocation repository", () => {
  let miniflare: Miniflare;
  let repository: D1InvocationRepository;

  beforeEach(async () => {
    miniflare = new Miniflare({
      compatibilityDate: "2026-07-19",
      d1Databases: { DB: "agentpaykit-test" },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    });
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
    repository = new D1InvocationRepository(database);
    await repository.createRelease({
      id: releaseId,
      packageDigest: `sha256:${"d".repeat(64)}`,
      publisherId: `0x${"e".repeat(40)}`,
      network: "eip155:84532",
      environment: "testnet",
      amount: "10000",
      asset: `0x${"a".repeat(40)}`,
      payee: `0x${"b".repeat(40)}`,
      maximumExecutionMs: 300_000,
      now: baseInvocation.now,
    });
    await repository.createQuote({
      id: quoteId,
      invocationId,
      releaseId,
      inputDigest,
      environment: "testnet",
      expiresAt: "2026-07-19T00:05:00.000Z",
      now: baseInvocation.now,
    });
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  test("returns the existing row for an identical binding", async () => {
    const created = await repository.createOrGetInvocation(baseInvocation);
    const repeated = await repository.createOrGetInvocation(baseInvocation);

    expect(created.kind).toBe("created");
    expect(repeated.kind).toBe("existing");
    expect(repeated.invocation).toEqual(created.invocation);
  });

  test("rejects the same invocation id with a different fingerprint", async () => {
    await repository.createOrGetInvocation(baseInvocation);

    await expect(
      repository.createOrGetInvocation({
        ...baseInvocation,
        requestFingerprint: `sha256:${"f".repeat(64)}`,
      }),
    ).rejects.toBeInstanceOf(InvocationBindingConflictError);
  });

  test("enforces unique quote and invocation identifiers", async () => {
    await expect(
      repository.createQuote({
        id: quoteId,
        invocationId: "inv_01J00000000000000000000001",
        releaseId,
        inputDigest,
        environment: "testnet",
        expiresAt: "2026-07-19T00:05:00.000Z",
        now: baseInvocation.now,
      }),
    ).rejects.toThrow();
  });

  test("allows only one concurrent Queue claimant through CAS", async () => {
    const created = await repository.createOrGetInvocation(baseInvocation);
    expect(
      await repository.transition({
        id: invocationId,
        from: "PAYMENT_VERIFIED",
        to: "QUEUED",
        expectedVersion: created.invocation.version,
        now: "2026-07-19T00:00:01.000Z",
      }),
    ).toBe(true);

    const attempts = await Promise.all([
      repository.transition({
        id: invocationId,
        from: "QUEUED",
        to: "EXECUTING",
        expectedVersion: 1,
        now: "2026-07-19T00:00:02.000Z",
      }),
      repository.transition({
        id: invocationId,
        from: "QUEUED",
        to: "EXECUTING",
        expectedVersion: 1,
        now: "2026-07-19T00:00:02.000Z",
      }),
    ]);

    expect(attempts.filter(Boolean)).toHaveLength(1);
    await expect(repository.getInvocation(invocationId)).resolves.toMatchObject(
      {
        status: "EXECUTING",
        version: 2,
      },
    );
  });

  test("selects retention candidates and deletes expired invocation metadata", async () => {
    await repository.createOrGetInvocation(baseInvocation);

    await expect(
      repository.listStaleInputs("2026-07-19T01:00:00.000Z"),
    ).resolves.toEqual([
      { id: invocationId, inputBlobKey: baseInvocation.inputBlobKey },
    ]);
    await repository.markInputDeleted(invocationId, "2026-07-19T01:00:00.000Z");
    await expect(
      repository.listStaleInputs("2026-07-19T02:00:00.000Z"),
    ).resolves.toEqual([]);

    const transitions = [
      ["PAYMENT_VERIFIED", "QUEUED"],
      ["QUEUED", "EXECUTING"],
      ["EXECUTING", "READY_TO_SETTLE"],
      ["READY_TO_SETTLE", "SETTLING"],
    ] as const;
    for (const [version, [from, to]] of transitions.entries()) {
      expect(
        await repository.transition({
          id: invocationId,
          from,
          to,
          expectedVersion: version,
          now: `2026-07-19T00:00:0${version + 1}.000Z`,
          candidateResultBlobKey:
            to === "READY_TO_SETTLE" ? "candidate/result" : undefined,
        }),
      ).toBe(true);
    }
    expect(
      await repository.transition({
        id: invocationId,
        from: "SETTLING",
        to: "RESULT_AVAILABLE",
        expectedVersion: 4,
        now: "2026-07-19T00:00:05.000Z",
        chargeState: "CHARGED",
        resultBlobKey: "result/final",
        resultDigest: `sha256:${"9".repeat(64)}`,
        transactionHash: `0x${"8".repeat(64)}`,
        resultExpiresAt: "2026-07-20T00:00:05.000Z",
      }),
    ).toBe(true);
    await repository.createReceipt({
      invocationId,
      receiptBlobKey: "receipt/final",
      receiptDigest: `sha256:${"7".repeat(64)}`,
      transactionHash: `0x${"8".repeat(64)}`,
      now: "2026-07-19T00:00:05.000Z",
    });

    await expect(
      repository.listExpiredResults("2026-07-20T00:00:05.000Z"),
    ).resolves.toEqual([
      {
        id: invocationId,
        version: 5,
        resultBlobKey: "result/final",
        candidateResultBlobKey: "candidate/result",
      },
    ]);
    await expect(
      repository.listExpiredMetadata("2026-08-19T00:00:00.000Z"),
    ).resolves.toEqual([
      {
        id: invocationId,
        quoteId,
        blobKeys: [
          baseInvocation.inputBlobKey,
          baseInvocation.paymentBlobKey,
          "candidate/result",
          "result/final",
          "receipt/final",
        ],
      },
    ]);

    await repository.deleteInvocationMetadata(invocationId, quoteId);
    await expect(
      repository.getInvocation(invocationId),
    ).resolves.toBeUndefined();
    await expect(repository.getQuote(quoteId)).resolves.toBeUndefined();
    await expect(repository.getReceipt(invocationId)).resolves.toBeUndefined();
  });
});
