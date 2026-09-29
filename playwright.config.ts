import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// E2E tests run against a local Supabase stack (never the live project) --
// scripts/e2e/setup-local-supabase.sh resets that stack and writes
// .env.test.local with its URL/keys plus the seeded admin's credentials.
// Loaded here (not just left for Next.js's own dotenv) so process.env also
// carries E2E_ADMIN_EMAIL/PASSWORD for the test files themselves, and so
// `env: { ...process.env }` below can forward everything to `next dev`.
const envPath = '.env.test.local';
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const match = /^([^#=]+)=(.*)$/.exec(line.trim());
    if (match) process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
  }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: { ...process.env, NODE_ENV: 'test' },
    stdout: 'pipe',
    timeout: 60_000,
  },
});
