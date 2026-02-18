import { initIntro } from './intro';
import { initScrollAnimations } from './scroll';

const base = import.meta.env.BASE_URL;

history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

document.documentElement.style.overflow = 'hidden';
document.body.style.overflow = 'hidden';

const criticalImages = [
  `${base}Images/photo4.jpg`,
  `${base}Images/image8.jpg`,
  `${base}Images/photo2.jpg`,
  `${base}Images/photo3.jpg`,
  `${base}Images/XR CLUB.jpg`,
  `${base}Images/sponsors.png`,
  `${base}Images/CS.png`,
  `${base}Images/IMDM.png`,
  `${base}Images/photo5.jpg`,
  `${base}Images/lab.webp`,
];
criticalImages.forEach(src => {
  const img = new Image();
  img.src = src;
});

function skipIntro() {
  const intro = document.querySelector('[data-intro]');
  if (intro) intro.remove();

  document.documentElement.dataset.skipIntro = 'true';

  const header = document.querySelector('[data-header]') as HTMLElement;
  if (header) header.style.opacity = '1';
  const footer = document.querySelector('[data-footer]') as HTMLElement;
  if (footer) {
    footer.style.visibility = 'visible';
    footer.style.opacity = '1';
  }

  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';

  initScrollAnimations();

  if (header) header.style.opacity = '1';

  const hash = window.location.hash.replace('#', '');
  if (hash) {
    requestAnimationFrame(() => {
      if (header) header.style.opacity = '1';

      if (hash === 'about') {
        const main = document.querySelector('[data-main]') as HTMLElement;
        if (main) {
          const vh = window.innerHeight;
          const pinScrollDist = 4.0 * 1.5 * vh;
          const aboutPos = main.offsetTop + pinScrollDist * (3.95 / 4.0);
          window.scrollTo({ top: aboutPos, behavior: 'instant' });
        }
      } else {
        const section = document.querySelector(`[data-${hash}]`) as HTMLElement;
        if (section) section.scrollIntoView({ behavior: 'instant' });
      }
    });
  }
}

function init() {
  if (window.location.hash) {
    skipIntro();
    return;
  }

  initIntro(() => {
    window.scrollTo(0, 0);

    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';

    initScrollAnimations();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
