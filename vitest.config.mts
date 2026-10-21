import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // tsconfig has a single mapping (`@/*` -> `./src/*`), so a plain alias
    // covers it; vite-tsconfig-paths would be one more plugin for one line.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // The API and mock layers are plain TypeScript; no DOM is needed.
    environment: "node",
    // Narrowed on purpose: scripts/*.test.mjs run under node:test
    // (`npm run test:scripts`), and the Playwright specs land outside src/.
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    restoreMocks: true,
    unstubEnvs: true,
    // `stubLocalStorage()` installs `window`/`document`; never leak them.
    unstubGlobals: true,
  },
});
