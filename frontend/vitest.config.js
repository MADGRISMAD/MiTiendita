import { defineConfig } from "vitest/config";

// Solo las pruebas de src/__tests__ (seo-sync.test.mjs es un script del build, no una suite)
export default defineConfig({
  test: { include: ["src/__tests__/**/*.test.js"], environment: "node" },
});
