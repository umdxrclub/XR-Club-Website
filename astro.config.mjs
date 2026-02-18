import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://xr.umd.edu',
  vite: {
    build: {
      cssMinify: true,
    },
    optimizeDeps: {
      include: ['gsap'],
    },
  },
});
