import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    reducedMotion: "no-preference",
  },
  webServer: {
    command: "vite --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/tests/fixtures/text.html",
    reuseExistingServer: true,
  },
});
