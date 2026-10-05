import { defineConfig } from '@playwright/test';

// Les defauts correspondent aux ports exposes par docker-compose.yml (T6) :
// tout passe par la gateway NGINX (GATEWAY_PORT, 52 par defaut).
const gateway =
  process.env.E2E_GATEWAY_URL ?? `http://localhost:${process.env.GATEWAY_PORT ?? 52}`;

export default defineConfig({
  testDir: './tests',
  // La stack est partagee et le chat est sequentiel : un seul worker.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: gateway,
    extraHTTPHeaders: { Accept: 'application/json' },
    trace: 'retain-on-failure',
  },
});
