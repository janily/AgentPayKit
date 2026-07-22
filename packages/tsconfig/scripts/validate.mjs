import { readFile } from "node:fs/promises";

const configs = ["base.json", "node.json", "react.json"];

for (const config of configs) {
  const contents = await readFile(
    new URL(`../${config}`, import.meta.url),
    "utf8",
  );
  const parsed = JSON.parse(contents);
  if (
    typeof parsed.compilerOptions !== "object" ||
    parsed.compilerOptions === null
  ) {
    throw new Error(`${config} must define compilerOptions`);
  }
}
