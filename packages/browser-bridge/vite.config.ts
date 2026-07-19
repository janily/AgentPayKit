import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ["e2e/**", "**/node_modules/**", "**/dist/**", "**/dist-lib/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(packageRoot, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: "assets/bridge.js",
        assetFileNames: (asset) =>
          asset.name?.endsWith(".css")
            ? "assets/bridge.css"
            : "assets/[name][extname]",
      },
    },
  },
});
