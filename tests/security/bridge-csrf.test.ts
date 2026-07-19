import { request } from "node:http";

import { LoopbackBridgeServer } from "../../packages/browser-bridge/src/server/loopback-server";
import { afterEach, expect, test } from "vitest";

const display = {
  invocationId: "inv_01J00000000000000000000000",
  inputDigest: `sha256:${"a".repeat(64)}`,
  amount: "10000",
  payee: `0x${"b".repeat(40)}`,
  network: "eip155:84532",
  releaseId: `rel_${"c".repeat(64)}`,
  dataDisclosure: "Only the selected runtime receives input.",
  paymentRequired: "test-only",
} as const;

function post(
  port: number,
  path: string,
  input: { host?: string; origin?: string; token?: string },
): Promise<number> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      token: input.token,
      paymentSignature: "test-only-payment",
    });
    const outgoing = request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          host: input.host ?? `127.0.0.1:${port}`,
          origin: input.origin ?? `http://127.0.0.1:${port}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

let server: LoopbackBridgeServer | undefined;
afterEach(async () => server?.close());

test("bridge rejects remote host, cross-origin, CSRF, and replay", async () => {
  server = await LoopbackBridgeServer.start({ platform: "darwin" });
  const session = server.createSession(display);
  const path = `/api/sessions/${session.id}/approve`;
  expect(
    await post(server.port, path, {
      host: `localhost:${server.port}`,
      token: session.token,
    }),
  ).toBe(403);
  expect(
    await post(server.port, path, {
      origin: "https://attacker.test",
      token: session.token,
    }),
  ).toBe(403);
  expect(await post(server.port, path, {})).toBe(403);

  expect(await post(server.port, path, { token: session.token })).toBe(204);
  expect(await post(server.port, path, { token: session.token })).toBe(409);
});
