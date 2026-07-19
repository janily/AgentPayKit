import { Hono } from "hono";

import { recoveryErrorResponse } from "./recovery-error";

export function createResultRoutes(options: {
  result(id: string): Promise<unknown>;
  traceId(): string;
}): Hono {
  const app = new Hono();
  app.get("/v1/invocations/:id/result", async (context) => {
    try {
      return context.json(await options.result(context.req.param("id")));
    } catch (error) {
      return recoveryErrorResponse(error, options.traceId());
    }
  });
  return app;
}
