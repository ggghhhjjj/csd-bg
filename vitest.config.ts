import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/tests/**/*.test.ts"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/core/src/**/*.ts", "packages/cli/src/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@csd-bg/core": path.resolve(__dirname, "packages/core/src/index.ts"),
    },
  },
});
