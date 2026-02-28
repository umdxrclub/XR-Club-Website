import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://xr.umd.edu',
  integrations: [sitemap()],
  vite: {
    build: {
      cssMinify: true,
    },
    optimizeDeps: {
      include: ['gsap'],
    },
  },
});
