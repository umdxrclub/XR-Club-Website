/** Reveal the completed opening frame after layout observers have settled. */
export function markHomeReady(root: HTMLElement, part: 'carousel' | 'background') {
  root.dataset[part === 'carousel' ? 'homeCarouselReady' : 'homeBackgroundReady'] = 'true';
  if (!root.dataset.homeCarouselReady || !root.dataset.homeBackgroundReady || root.dataset.homeReady) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!root.isConnected || root.dataset.homeReady) return;
    root.dataset.homeReady = 'true';
    document.dispatchEvent(new CustomEvent('xr:home-ready'));
  }));
}
