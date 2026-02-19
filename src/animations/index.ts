import { initIntro } from './intro';
import { supabase } from '../lib/supabase';

document.documentElement.style.overflow = 'hidden';
document.body.style.overflow = 'hidden';

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

async function init() {
  if (window.location.hash) {
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
  initIntro(() => {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init());
} else {
  init();
}
