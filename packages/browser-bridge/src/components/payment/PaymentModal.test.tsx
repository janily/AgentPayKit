import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { PaymentModal } from "./PaymentModal";

describe("PaymentModal", () => {
  test("shows payment metadata and a reject action without raw input", () => {
    const html = renderToStaticMarkup(
      <PaymentModal
        amount="0.01"
        payee="0x1111111111111111111111111111111111111111"
        network="Base Sepolia · eip155:84532"
        inputDigest="sha256:abc123"
        releaseId={`rel_${"a".repeat(64)}`}
        dataDisclosure="Only the selected runtime receives the input."
        onApprove={() => undefined}
        onReject={() => undefined}
        {...({ rawInput: "private research prompt" } as object)}
      />,
    );

    expect(html).toContain("0.01");
    expect(html).toContain("0x111111");
    expect(html).toContain("eip155:84532");
    expect(html).toContain("Reject");
    expect(html).toContain("Release");
    expect(html).toContain("Only the selected runtime receives the input.");
    expect(html).not.toContain("private research prompt");
  });
});
