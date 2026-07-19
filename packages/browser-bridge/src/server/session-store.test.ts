import { describe, expect, test, vi } from "vitest";

import { BridgeSessionError, SessionStore } from "./session-store";

const display = {
  invocationId: "inv_01J00000000000000000000000",
  inputDigest: `sha256:${"a".repeat(64)}`,
  amount: "10000",
  payee: `0x${"b".repeat(40)}`,
  network: "eip155:84532",
  releaseId: `rel_${"c".repeat(64)}`,
  dataDisclosure: "Input is sent only to the selected skill runtime.",
  paymentRequired: "official-challenge",
} as const;

describe("Bridge SessionStore", () => {
  test("issues a 256-bit body token and consumes it only once", () => {
    const store = new SessionStore({ now: () => 1_000 });
    const session = store.create(display);

    expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.consume(session.id, session.token, "approved")).toMatchObject({
      state: "approved",
    });
    expect(() => store.consume(session.id, session.token, "approved")).toThrow(
      BridgeSessionError,
    );
  });

  test("rejects expired tokens and destroys closed sessions", () => {
    let now = 1_000;
    const store = new SessionStore({ now: () => now, ttlMs: 300_000 });
    const expired = store.create(display);
    now += 300_001;
    expect(() => store.consume(expired.id, expired.token, "approved")).toThrow(
      /SESSION_EXPIRED/,
    );

    const closed = store.create(display);
    store.close(closed.id);
    expect(() => store.view(closed.id)).toThrow(/SESSION_NOT_FOUND/);
  });

  test("destroyAll clears pending sessions when the server closes", () => {
    const store = new SessionStore({ now: vi.fn(() => 1_000) });
    const first = store.create(display);
    const second = store.create(display);

    store.destroyAll();

    expect(() => store.view(first.id)).toThrow(/SESSION_NOT_FOUND/);
    expect(() => store.view(second.id)).toThrow(/SESSION_NOT_FOUND/);
  });
});
