import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { expect, test, type Page } from "@playwright/test";

const invocationId = "inv_01J00000000000000000000000";
const asset = `0x${"2".repeat(40)}`;
const payee = `0x${"3".repeat(40)}`;

const required: PaymentRequired = {
  x402Version: 2,
  resource: { url: "https://runtime.test/v1/invocations" },
  accepts: [
    {
      scheme: "exact",
      network: "eip155:84532",
      asset,
      amount: "10000",
      payTo: payee,
      maxTimeoutSeconds: 300,
      extra: { name: "USD Coin", version: "2" },
    },
  ],
};

async function openBridge(
  page: Page,
  mode: "approve" | "reject" | "wrong-chain" | "insufficient",
) {
  const actions: string[] = [];
  await page.context().route("**/api/sessions/**", async (route) => {
    actions.push(route.request().url().split("/").at(-1) ?? "");
    await route.fulfill({ status: 204 });
  });
  await page.addInitScript(
    ({ bootstrap, scenario }) => {
      Object.defineProperty(window, "__AGENTPAY_BRIDGE__", {
        value: bootstrap,
        configurable: false,
      });
      Object.defineProperty(window, "ethereum", {
        value: {
          async request({ method }: { method: string }) {
            if (method === "eth_chainId") {
              return scenario === "wrong-chain" ? "0x2105" : "0x14a34";
            }
            if (method === "eth_requestAccounts") {
              return [`0x${"1".repeat(40)}`];
            }
            if (method === "eth_call") {
              const balance = scenario === "insufficient" ? 9_999n : 50_000n;
              return `0x${balance.toString(16).padStart(64, "0")}`;
            }
            if (method === "eth_signTypedData_v4") {
              if (scenario === "reject") {
                throw new Error("User rejected the request");
              }
              return `0x${"4".repeat(130)}`;
            }
            throw new Error(`unexpected method ${method}`);
          },
        },
        configurable: false,
      });
    },
    {
      bootstrap: {
        id: "local-session",
        token: "t".repeat(43),
        request: {
          invocationId,
          inputDigest: `sha256:${"a".repeat(64)}`,
          amount: "0.01",
          payee,
          network: "eip155:84532",
          releaseId: `rel_${"c".repeat(64)}`,
          dataDisclosure: "Input is sent only to the selected skill runtime.",
          paymentRequired: encodePaymentRequiredHeader(required),
        },
      },
      scenario: mode,
    },
  );
  await page.goto("/");
  return actions;
}

test("approves with mock MetaMask without exposing raw input", async ({
  page,
}) => {
  const actions = await openBridge(page, "approve");
  await expect(page.getByText("Review this invocation")).toBeVisible();
  await expect(
    page.getByText("Input is sent only to the selected skill runtime."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve in MetaMask" }).click();
  await expect.poll(() => actions).toContain("approve");
  await expect(page.locator("body")).not.toContainText(
    "private research prompt",
  );
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(new URL(page.url()).search).toBe("");
  expect(new URL(page.url()).hash).toBe("");
});

test("rejects explicitly and reports wallet rejection", async ({ page }) => {
  const actions = await openBridge(page, "approve");
  await page.getByRole("button", { name: "Reject" }).click();
  await expect.poll(() => actions).toContain("reject");

  const rejectedPage = await page.context().newPage();
  await openBridge(rejectedPage, "reject");
  await rejectedPage
    .getByRole("button", { name: "Approve in MetaMask" })
    .click();
  await expect(rejectedPage.getByRole("alert")).toContainText(
    "signature was rejected",
  );
});

test("blocks wrong chain and insufficient balance", async ({ page }) => {
  await openBridge(page, "wrong-chain");
  await page.getByRole("button", { name: "Approve in MetaMask" }).click();
  await expect(page.getByRole("alert")).toContainText("wrong network");

  const insufficientPage = await page.context().newPage();
  await openBridge(insufficientPage, "insufficient");
  await insufficientPage
    .getByRole("button", { name: "Approve in MetaMask" })
    .click();
  await expect(insufficientPage.getByRole("alert")).toContainText(
    "enough USDC",
  );
});

test("notifies the loopback server when the window closes", async ({
  page,
}) => {
  const actions = await openBridge(page, "approve");
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: false }),
    ),
  );
  await expect.poll(() => actions).toContain("close");
  await page.close();
});
