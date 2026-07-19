import { Hono } from "hono";

import { recoveryErrorResponse } from "./recovery-error";

export function createReceiptRoutes(options: {
  receipt(id: string): Promise<unknown>;
  traceId(): string;
}): Hono {
  const app = new Hono();
  app.get("/v1/invocations/:id/receipt", async (context) => {
    try {
      return context.json(await options.receipt(context.req.param("id")));
    } catch (error) {
      return recoveryErrorResponse(error, options.traceId());
    }
  });
  return app;
}
