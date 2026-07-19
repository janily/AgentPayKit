import { Hono } from "hono";

import { recoveryErrorResponse } from "./recovery-error";

export function createStatusRoutes(options: {
  status(id: string): Promise<unknown>;
  traceId(): string;
}): Hono {
  const app = new Hono();
  app.get("/v1/invocations/:id/status", async (context) => {
    try {
      return context.json(await options.status(context.req.param("id")));
    } catch (error) {
      return recoveryErrorResponse(error, options.traceId());
    }
  });
  return app;
}
