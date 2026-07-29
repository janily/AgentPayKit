import { definePaidSkill } from "@agentpaykit/server";
import { z } from "zod";

import { isPublicGitHubRepository } from "./src/github";
import { reviewRepository } from "./src/review-repository";

const testPayee = "0x1111111111111111111111111111111111111111";
const payTo = process.env.AGENTPAY_RECEIVER_ADDRESS;
const allowsTestPayee =
  process.env.NODE_ENV === "test" ||
  process.env.AGENTPAY_ALLOW_TEST_RECEIVER === "1";
if (
  (payTo === undefined || payTo === "" || payTo === testPayee) &&
  !allowsTestPayee
) {
  throw new Error("AGENTPAY_RECEIVER_ADDRESS_REQUIRED");
}

export default definePaidSkill({
  name: "paid-repo-review",
  description:
    "Reviews a public GitHub repository and returns actionable findings.",
  endpointPath: "/api/invoke",
  price: "0.01",
  network: "base-sepolia",
  payTo: (payTo ?? testPayee) as `0x${string}`,
  facilitatorUrl: "https://x402.org/facilitator",
  timeoutMs: 45_000,
  exampleInput: {
    repository: "https://github.com/openai/openai-node",
  },
  input: z.object({
    repository: z.string().refine(isPublicGitHubRepository, {
      message: "Must be an exact public GitHub repository URL.",
    }),
  }),
  output: z.object({
    summary: z.string().min(1),
    signals: z.array(z.string()),
    recommendations: z.array(z.string()),
    sources: z.array(z.string().url()).min(1),
  }),
  execute: async (input, { signal }) =>
    reviewRepository(input.repository, signal),
  success: (result) => result.sources.length > 0,
});
