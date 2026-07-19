import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const output = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const bridgeSource = fileURLToPath(
  new URL("../../browser-bridge/dist/", import.meta.url),
);
const bridgeOutput = fileURLToPath(new URL("../dist/bridge/", import.meta.url));

await build({
  entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  legalComments: "none",
});
await rm(bridgeOutput, { recursive: true, force: true });
await mkdir(bridgeOutput, { recursive: true });
await cp(bridgeSource, bridgeOutput, { recursive: true });
