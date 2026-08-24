import {defineConfig} from '@playwright/test';

const touch = {isMobile: true, hasTouch: true, colorScheme: 'dark'};
const desktop = {isMobile: false, hasTouch: false, colorScheme: 'dark'};

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: {timeout: 8_000},
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {name: 'mobile-narrow', use: {...touch, viewport: {width: 320, height: 700}}},
    {name: 'mobile-standard', use: {...touch, viewport: {width: 390, height: 844}}},
    {name: 'mobile-wide', use: {...touch, viewport: {width: 430, height: 932}}},
    {name: 'tablet', use: {...touch, viewport: {width: 768, height: 1024}}},
    {name: 'laptop', use: {...desktop, viewport: {width: 1280, height: 800}}},
    {name: 'desktop', use: {...desktop, viewport: {width: 1440, height: 1000}}},
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
