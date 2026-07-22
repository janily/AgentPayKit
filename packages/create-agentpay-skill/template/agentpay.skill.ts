import { definePaidSkill } from "@agentpaykit/server";
import { z } from "zod";

import { reviewRepository } from "./src/review-repository";

export default definePaidSkill({
  name: "__PROJECT_NAME__",
  description:
    "Reviews a public GitHub repository and returns actionable findings.",
  endpointPath: "/api/invoke",
  price: "0.05",
  network: "base-sepolia",
  payTo: "0x1111111111111111111111111111111111111111",
  facilitatorUrl: "https://x402.org/facilitator",
  timeoutMs: 45_000,
  exampleInput: {
    repository: "https://github.com/owner/repository",
  },
  input: z.object({
    repository: z.string().url(),
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
