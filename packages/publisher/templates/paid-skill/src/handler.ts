import { Hono } from "hono";

export interface Env {
  AGENTPAY_ENVIRONMENT: "testnet" | "mainnet";
}

export const app = new Hono<{ Bindings: Env }>().post(
  "/execute",
  async (context) => {
    const input = await context.req.json<{ query: string }>();
    return context.json({
      summary: `{{className}} received ${input.query.length} characters`,
    });
  },
);

export default app;
