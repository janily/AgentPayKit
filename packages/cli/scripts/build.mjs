import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const output = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const bridgeJavaScript = await readFile(
  new URL("../../browser-bridge/dist/assets/bridge.js", import.meta.url),
  "utf8",
);
const bridgeCss = await readFile(
  new URL("../../browser-bridge/dist/assets/bridge.css", import.meta.url),
  "utf8",
);

await build({
  entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  legalComments: "none",
  plugins: [
    {
      name: "embedded-bridge-assets",
      setup(buildContext) {
        buildContext.onResolve({ filter: /^\.\/bridge-assets$/ }, () => ({
          path: "bridge-assets",
          namespace: "agentpaykit",
        }));
        buildContext.onLoad(
          { filter: /^bridge-assets$/, namespace: "agentpaykit" },
          () => ({
            loader: "js",
            contents: `/* AGENTPAYKIT_EMBEDDED_BRIDGE_ASSETS */\nexport const BRIDGE_ASSETS = ${JSON.stringify(
              {
                "agentpaykit.marker": "AGENTPAYKIT_EMBEDDED_BRIDGE_ASSETS",
                "assets/bridge.js": bridgeJavaScript,
                "assets/bridge.css": bridgeCss,
              },
            )};`,
          }),
        );
      },
    },
  ],
});
