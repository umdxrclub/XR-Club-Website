import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://xr.umd.edu',
  output: 'static',
  // Preserve existing inline spacing across compiler upgrades.
  compressHTML: true,
});
