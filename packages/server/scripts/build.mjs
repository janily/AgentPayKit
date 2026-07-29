import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const x402NextEntry = fileURLToPath(import.meta.resolve("@x402/next"));

await build({
  entryPoints: [fileURLToPath(new URL("../src/next.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/next.js", import.meta.url)),
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  target: "es2022",
  sourcemap: false,
  legalComments: "none",
  plugins: [
    {
      name: "x402-next-node-esm",
      setup(context) {
        context.onResolve({ filter: /^@x402\/next$/ }, () => ({
          path: x402NextEntry,
        }));
        context.onResolve({ filter: /^next\/server$/ }, () => ({
          path: "next/server.js",
          external: true,
        }));
      },
    },
  ],
});
