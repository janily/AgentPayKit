import { defineConfig } from "vitest/config";

export default defineConfig({
  ssr: {
    noExternal: ["@x402/next"],
  },
});
