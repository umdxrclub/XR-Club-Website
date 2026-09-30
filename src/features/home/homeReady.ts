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

/** Resolves once the opening frame is shown, or immediately on pages without one. */
export function homeVisible() {
  return new Promise<void>(resolve => {
    if (!document.documentElement.hasAttribute('data-home-loading')) resolve();
    else document.addEventListener('xr:home-visible', () => resolve(), { once: true });
  });
}
