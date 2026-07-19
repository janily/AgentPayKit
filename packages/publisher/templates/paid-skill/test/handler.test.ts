import assert from "node:assert/strict";
import test from "node:test";

import { app } from "../src/handler.ts";
import { isSuccessful } from "../src/success-policy.ts";

test("executes through the declared success policy", async () => {
  const response = await app.request(
    "http://skill.test/execute",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "bounded research" }),
    },
    { AGENTPAY_ENVIRONMENT: "testnet" },
  );
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(isSuccessful(result), true);
});
