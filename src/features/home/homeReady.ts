const parts = { carousel: 'homeCarouselReady', background: 'homeBackgroundReady', section: 'homeSectionReady' } as const;

/** Reveal the completed opening frame after layout observers have settled. */
export function markHomeReady(root: HTMLElement, part: keyof typeof parts) {
  root.dataset[parts[part]] = 'true';
  if (Object.values(parts).some(key => !root.dataset[key]) || root.dataset.homeReady) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!root.isConnected || root.dataset.homeReady) return;
    root.dataset.homeReady = 'true';
    document.dispatchEvent(new CustomEvent('xr:home-ready'));
  }));
}

/** Resolves once the opening frame is shown and the HomeIntro folder has finished, or immediately on pages without them. */
export function homeSettled() {
  const root = document.documentElement;
  return new Promise<void>(resolve => {
    const check = () => {
      if (root.hasAttribute('data-home-loading') || root.hasAttribute('data-home-intro-on')) return;
      document.removeEventListener('xr:home-visible', check);
      document.removeEventListener('xr:home-settled', check);
      resolve();
    };
    document.addEventListener('xr:home-visible', check);
    document.addEventListener('xr:home-settled', check);
    check();
  });
}
