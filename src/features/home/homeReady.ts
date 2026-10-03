const parts = { carousel: 'homeCarouselReady', background: 'homeBackgroundReady', section: 'homeSectionReady' } as const;
const preparations = { waves: 'homeWavesPrepared', glasses: 'homeGlassesPrepared', sky: 'homeSkyPrepared' } as const;

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

/** Resolves once the opening frame has painted under the HomeIntro sheet, or is shown without one: heavy setup can run unseen. */
export function homePainted() {
  const root = document.documentElement;
  return new Promise<void>(resolve => {
    const check = () => {
      if (root.hasAttribute('data-home-loading') && !root.hasAttribute('data-home-painting')) return;
      document.removeEventListener('xr:home-painting', check);
      document.removeEventListener('xr:home-visible', check);
      resolve();
    };
    document.addEventListener('xr:home-painting', check);
    document.addEventListener('xr:home-visible', check);
    check();
  });
}

/** Setup that would stutter the page if it ran after the morph reports here; the morph waits until every part has. */
export function markHomePrepared(root: HTMLElement, part: keyof typeof preparations) {
  root.dataset[preparations[part]] = 'true';
  if (Object.values(preparations).some(key => !root.dataset[key]) || root.dataset.homePrepared) return;
  root.dataset.homePrepared = 'true';
  document.documentElement.setAttribute('data-home-prepared', '');
  document.dispatchEvent(new CustomEvent('xr:home-prepared'));
}

/** Resolves once the opening frame is shown and the HomeIntro morph has finished, or immediately on pages without them. */
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
