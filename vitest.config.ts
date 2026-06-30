import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts", "index.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      all: true,
    },
  },
});
