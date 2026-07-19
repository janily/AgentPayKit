import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, test } from "vitest";

const instances: Miniflare[] = [];

afterEach(async () => {
  await Promise.all(instances.splice(0).map((instance) => instance.dispose()));
});

describe("Cloudflare Workers compatibility", () => {
  test("bundles and boots the runtime in Miniflare", async () => {
    const bundle = await build({
      entryPoints: [new URL("../src/index.ts", import.meta.url).pathname],
      bundle: true,
      conditions: ["worker", "browser"],
      external: ["url"],
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
    });
    const script = bundle.outputFiles[0]?.text;
    expect(script).toBeTruthy();

    const miniflare = new Miniflare({
      compatibilityDate: "2026-07-19",
      compatibilityFlags: ["nodejs_compat"],
      modules: true,
      script: script!,
    });
    instances.push(miniflare);

    const health = await miniflare.dispatchFetch("http://runtime.test/health");
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: "ok" });

    const paidRoute = await miniflare.dispatchFetch(
      "http://runtime.test/v1/invocations",
      {
        method: "POST",
      },
    );
    expect(paidRoute.status).toBe(503);
    await expect(paidRoute.json()).resolves.toEqual({
      error: "runtime_not_configured",
    });

    const removedSpike = await miniflare.dispatchFetch(
      "http://runtime.test/spike/paid-ping",
      { method: "POST" },
    );
    expect(removedSpike.status).toBe(404);
  });
});
