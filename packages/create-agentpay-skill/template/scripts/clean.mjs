import { rm } from "node:fs/promises";

await Promise.all(
  [".next", "tsconfig.tsbuildinfo"].map((path) =>
    rm(path, { recursive: true, force: true }),
  ),
);
