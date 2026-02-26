import { initIntro } from './intro';
import { supabase } from '../lib/supabase';

let introPlayed = false;

function dismissLoader() {
  const loader = document.querySelector('[data-loader]');
  if (loader) {
    (loader as HTMLElement).classList.add('loader--hidden');
    setTimeout(() => loader.remove(), 600);
  }
}

function skipIntro() {
  const intro = document.querySelector('[data-intro]');
  if (intro) intro.remove();

  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';

  dismissLoader();

  const hash = window.location.hash.replace('#', '');
  if (hash) {
    requestAnimationFrame(() => {
      const section = document.querySelector(`[data-${hash}]`) as HTMLElement;
      if (section) section.scrollIntoView({ behavior: 'instant' });
    });
  }
}

export async function init() {
  if (introPlayed) {
    skipIntro();
    return;
  }
  introPlayed = true;

  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  if (window.location.hash || window.innerWidth <= 768) {
    skipIntro();
    return;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      skipIntro();
      return;
    }
  } catch {}

  dismissLoader();

  const skipBtn = document.getElementById('intro-skip-btn');
  skipBtn?.addEventListener('click', () => {
    skipIntro();
  });

  initIntro(() => {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  });
}
