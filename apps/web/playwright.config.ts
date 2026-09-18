import { defineConfig, devices } from "@playwright/test";

/**
 * E2E: sobe a API contra um banco Postgres próprio (estudatta_e2e) e o Vite em 5182.
 * Usa o Chrome instalado (channel "chrome") para não depender de download de navegador.
 */
const API_PORT = 8022;
const WEB_PORT = 5182;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome", isMobile: true, viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: `bash ../../backend/scripts/e2e-api.sh ${API_PORT}`,
      url: `http://localhost:${API_PORT}/api/v1/health/live`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `API_URL=http://localhost:${API_PORT} npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
