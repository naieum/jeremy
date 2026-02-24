import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:5199",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
    },
    {
      name: "api",
      testMatch: /api\/.*\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "ui",
      testMatch: /ui\/.*\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npx vite dev --port 5199",
    port: 5199,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
