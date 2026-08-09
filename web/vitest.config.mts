import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Next's own build artefacts are not ours to test.
    exclude: ["node_modules/**", ".next/**"],
  },
  resolve: {
    alias: { "@": resolve(import.meta.dirname, ".") },
  },
});
