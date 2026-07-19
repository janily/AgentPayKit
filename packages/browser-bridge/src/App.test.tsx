import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import App from "./App";

test("the bridge shell never renders a caller-provided raw input", () => {
  const html = renderToStaticMarkup(
    <App
      request={{
        amount: "0.01",
        payee: "0x2222222222222222222222222222222222222222",
        network: "Base Mainnet · eip155:8453",
        inputDigest: "sha256:def456",
        releaseId: `rel_${"a".repeat(64)}`,
        dataDisclosure: "Only the selected runtime receives the input.",
      }}
      {...({ rawInput: "do not expose this" } as object)}
    />,
  );

  expect(html).toContain("One invocation. One explicit signature.");
  expect(html).toContain("Only the selected runtime receives the input.");
  expect(html).not.toContain("do not expose this");
});
