import { Hono } from "hono";

import { createReceiptRoutes } from "./receipt";
import { createResultRoutes } from "./result";
import { createStatusRoutes } from "./status";

export function createRecoveryRoutes(options: {
  recovery: {
    status(id: string): Promise<unknown>;
    result(id: string): Promise<unknown>;
    receipt(id: string): Promise<unknown>;
  };
  traceId(): string;
}): Hono {
  const app = new Hono();
  app.route(
    "/",
    createStatusRoutes({
      status: (id) => options.recovery.status(id),
      traceId: options.traceId,
    }),
  );
  app.route(
    "/",
    createResultRoutes({
      result: (id) => options.recovery.result(id),
      traceId: options.traceId,
    }),
  );
  app.route(
    "/",
    createReceiptRoutes({
      receipt: (id) => options.recovery.receipt(id),
      traceId: options.traceId,
    }),
  );
  return app;
}
