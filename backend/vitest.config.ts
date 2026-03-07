import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    singleFork: true,
    globalSetup: "./tests/vitest-global-setup.ts",
    setupFiles: ["./tests/vitest-setup.ts"],
  },
});
