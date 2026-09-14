import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://xr.umd.edu',
  redirects: {
    '/apply': '/suits/apply',
    '/suits-dashboard': '/suits/dashboard',
  },
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/login') &&
        !page.includes('/signup') &&
        !page.includes('/dashboard') &&
        !page.includes('/forgot-password') &&
        !page.includes('/reset-password') &&
        !page.includes('/verify-email') &&
        !page.includes('/ideate') &&
        !page.includes('/demoday'),
    }),
  ],
  vite: {
    build: {
      cssMinify: true,
    },
    optimizeDeps: {
      include: ['gsap'],
    },
  },
});
