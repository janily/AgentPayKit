import { fileURLToPath } from "node:url";

import { build } from "esbuild";

await build({
  entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/index.js", import.meta.url)),
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  target: "esnext",
  sourcemap: false,
  legalComments: "none",
});
