import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } } as never,  // lets tests render components (tests/today-board.test.ts)
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  // Each database test builds a fresh Postgres with every migration (several seconds on a small machine).
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000 },
});
