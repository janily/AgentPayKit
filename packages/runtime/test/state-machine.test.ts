import { describe, expect, test } from "vitest";

import {
  allowedTransitions,
  assertTransition,
  canTransition,
} from "../src/state-machine";

describe("invocation state machine", () => {
  test.each(allowedTransitions)("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  test.each([
    ["EXECUTING", "SETTLING"],
    ["QUOTED", "RESULT_AVAILABLE"],
    ["RESULT_AVAILABLE", "EXECUTING"],
    ["RESULT_EXPIRED", "RESULT_AVAILABLE"],
  ] as const)("rejects illegal %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(
      `illegal invocation transition ${from} -> ${to}`,
    );
  });
});
