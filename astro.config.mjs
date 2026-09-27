import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://xr.umd.edu',
  output: 'static',
  redirects: {
    '/suits-dashboard': '/suits/dashboard/',
  },
  // Preserve existing inline spacing across compiler upgrades.
  compressHTML: true,
});
