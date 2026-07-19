import { createOfficialSpikeApp } from "./spike";

interface RuntimeEnvironment {
  FACILITATOR_URL?: string;
  PAYMENT_NETWORK?: "eip155:84532" | "eip155:8453";
  PAYMENT_PAYEE?: `0x${string}`;
  PAYMENT_AMOUNT?: string;
  PAYMENT_ASSET?: `0x${string}`;
}

function configuredApp(environment: RuntimeEnvironment) {
  if (
    !environment.FACILITATOR_URL ||
    !environment.PAYMENT_NETWORK ||
    !environment.PAYMENT_PAYEE ||
    !environment.PAYMENT_AMOUNT ||
    !environment.PAYMENT_ASSET
  ) {
    return undefined;
  }
  return createOfficialSpikeApp({
    facilitatorUrl: environment.FACILITATOR_URL,
    network: environment.PAYMENT_NETWORK,
    payee: environment.PAYMENT_PAYEE,
    amount: environment.PAYMENT_AMOUNT,
    asset: environment.PAYMENT_ASSET,
  });
}

export default {
  async fetch(
    request: Request,
    environment: RuntimeEnvironment,
  ): Promise<Response> {
    if (new URL(request.url).pathname === "/health") {
      return Response.json({ status: "ok" });
    }
    const app = configuredApp(environment);
    if (!app) {
      return Response.json(
        { error: "runtime_not_configured" },
        { status: 503 },
      );
    }
    return app.fetch(request, environment);
  },
};

export { createOfficialSpikeApp, createRuntimeApp } from "./spike";
