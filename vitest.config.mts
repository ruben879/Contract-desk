import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } } as never,  // lets tests render components (tests/today-board.test.ts)
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: { include: ["tests/**/*.test.ts"] },
});
