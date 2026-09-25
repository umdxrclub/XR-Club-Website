import { homeSectionStops, isHomeSection, sectionAtTravel, type HomeSection } from './homeSections';
import { morphHomeScene } from './homeSceneTransition';
import { siteLinks } from '../config/site';

export function mountHomeNavigation(header: HTMLElement) {
  const candidate = document.querySelector<HTMLElement>('[data-home-waves]');
  const viewport = candidate?.querySelector<HTMLElement>('[data-home-waves-stage]');
  if (!candidate || !viewport) return () => {};
  const root = candidate, stage = viewport;
  const controller = new AbortController(), options = { signal: controller.signal };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const links = [...header.querySelectorAll<HTMLAnchorElement>('[data-home-section]')];
  const previousRestoration = history.scrollRestoration;
  history.scrollRestoration = 'manual';
  let disposed = false, busy = false;
  let animation: AbortController | undefined;
  let queued: { section: HomeSection; focus: boolean; animate: boolean } | undefined;
  let requested: HomeSection | undefined;
  const readTravel = () => Number(root.dataset.storyTravel) || 0;

  function current(section = sectionAtTravel(readTravel(), reduced.matches)) {
    for (const link of links) {
      if (link.dataset.homeSection === section) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }
  function seek(travel: number, commit = false, hold = true) {
    root.dispatchEvent(new CustomEvent('xr:story-seek', { detail: { travel, commit, hold } }));
  }
  function focusHeading(section: HomeSection) {
    const selector = { home: '.home-statement', projects: '#home-projects-title',
      about: '#club-story-accessible-title', equipment: '[data-equipment-heading]' }[section];
    const heading = root.querySelector<HTMLElement>(selector);
    if (heading && !heading.closest('[inert]')) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }
  function prepare(section: HomeSection) {
    const preparations: Promise<void>[] = [];
    root.dispatchEvent(new CustomEvent('xr:prepare-section', {
      detail: { section, waitUntil: (ready: Promise<void>) => preparations.push(ready) },
    }));
    return Promise.all(preparations);
  }
  function resetProjects() {
    root.querySelector('[data-project-cabinet]')?.dispatchEvent(new CustomEvent('xr:project-story-reset'));
  }
  function playProjectFlight(from: number, to: number, signal: AbortSignal) {
    return new Promise<void>(resolve => {
      const start = performance.now();
      let frame = 0;
      function finish() { cancelAnimationFrame(frame); signal.removeEventListener('abort', finish); resolve(); }
      function tick(now: number) {
        if (signal.aborted || disposed) { finish(); return; }
        const p = Math.min(1, (now - start) / 1550);
        // The existing flight and liquid each supply their own easing.
        seek(from + (to - from) * p);
        if (p < 1) frame = requestAnimationFrame(tick); else finish();
      }
      signal.addEventListener('abort', finish, { once: true });
      frame = requestAnimationFrame(tick);
    });
  }
  async function go(section: HomeSection, animate = true, focus = false) {
    if (disposed) return;
    if (busy) {
      queued = { section, focus, animate };
      current(section);
      return;
    }
    busy = true; requested = section; animation = new AbortController();
    const signal = animation.signal;
    root.setAttribute('data-navigating', section);
    stage.inert = true;
    current(section);
    const stops = homeSectionStops(reduced.matches), target = stops[section], from = readTravel();
    const apply = () => {
      if (section === 'projects') resetProjects();
      seek(target, true);
    };
    try {
      // Keep the current scene intact until the sky's full-resolution layers
      // are decoded, including cold /about entry and direct menu jumps.
      await prepare(section);
      if (signal.aborted || disposed) return;
      if (!animate || reduced.matches || Math.abs(from - target) < .005) apply();
      else if ((section === 'projects' || section === 'home') && from <= stops.projects + .01) {
        if (section === 'projects') resetProjects();
        await playProjectFlight(from, target, signal);
      } else {
        // Home starts at the same Design period as the scroll animation.
        // The other scenes open from the center of their visible composition.
        const origin = from < .01 ? {
          x: Number(root.style.getPropertyValue('--project-origin-x')) || .72,
          y: Number(root.style.getPropertyValue('--project-origin-y')) || .54,
          radius: 0,
        } : { x: .5, y: .5, radius: 0 };
        seek(from);
        await morphHomeScene(stage, origin, () => {
          apply();
          if (section === 'home') root.querySelector('[data-home-gallery]')?.dispatchEvent(new CustomEvent('xr:carousel-freeze', { detail: true }));
        }, signal);
      }
    } finally {
      busy = false; requested = undefined; animation = undefined;
      root.removeAttribute('data-navigating');
      stage.inert = false;
      if (!disposed) {
        seek(signal.aborted ? readTravel() : target, true, false);
        if (section === 'home') root.querySelector('[data-home-gallery]')?.dispatchEvent(new CustomEvent('xr:carousel-freeze', { detail: false }));
        if (focus && !queued) focusHeading(section);
        const next = queued; queued = undefined;
        if (next) void go(next.section, next.animate, next.focus);
        else current();
      }
    }
  }

  function activate(link: HTMLAnchorElement, event: MouseEvent) {
    const section = link.dataset.homeTarget;
    if (!section || !isHomeSection(section)) return;
    event.preventDefault();
    if (location.pathname !== new URL(link.href).pathname || location.hash) history.pushState(history.state, '', link.href);
    void go(section, true, event.detail === 0);
  }
  function primaryClick(event: MouseEvent) {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }
  const anticipate = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const section = event.target.closest<HTMLElement>('[data-home-target]')?.dataset.homeTarget;
    if (section && isHomeSection(section)) void prepare(section);
  };
  header.addEventListener('pointerover', anticipate, options);
  header.addEventListener('focusin', anticipate, options);
  header.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !primaryClick(event)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[data-home-target]');
    if (link) activate(link, event);
  }, options);
  // Native scene snapshots retarget pointer input to the document root. Keep
  // the visible header usable by resolving its unchanged link rectangles.
  document.addEventListener('click', event => {
    if (!busy || !document.documentElement.hasAttribute('data-scene-navigation') || !primaryClick(event)
      || event.detail === 0 || (event.target instanceof Node && header.contains(event.target))) return;
    const link = [...header.querySelectorAll<HTMLAnchorElement>('a[data-home-target]')].find(element => {
      const box = element.getBoundingClientRect();
      return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    });
    if (link) activate(link, event);
  }, options);
  const sectionFromPath = () => {
    const path = location.pathname.replace(/\/$/, '');
    const section = links.find(link => new URL(link.href).pathname.replace(/\/$/, '') === path)?.dataset.homeSection;
    return section && isHomeSection(section) ? section : undefined;
  };
  const followLocation = (animate = true) => {
    const legacySection = location.hash.slice(1);
    const section = isHomeSection(legacySection) ? legacySection : sectionFromPath();
    if (!section) return;
    // Existing shared hash links still work, then become clean section URLs.
    if (isHomeSection(legacySection)) history.replaceState(history.state, '', siteLinks[section] + location.search);
    void go(section, animate);
  };
  window.addEventListener('hashchange', () => followLocation(), options);
  window.addEventListener('popstate', event => {
    if (!sectionFromPath()) return;
    // These routes share the current scene; keep Astro from replacing it.
    event.stopImmediatePropagation();
    followLocation();
  }, { ...options, capture: true });
  root.addEventListener('xr:story-position', () => { if (!requested) current(); }, options);
  // Scroll input cannot drag the document while the header owns the scene.
  window.addEventListener('wheel', event => { if (busy) event.preventDefault(); }, { ...options, passive: false });
  window.addEventListener('touchmove', event => { if (busy) event.preventDefault(); }, { ...options, passive: false });
  window.addEventListener('keydown', event => {
    if (!busy) return;
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) event.preventDefault();
    if (event.key === 'Escape') animation?.abort();
  }, options);
  window.addEventListener('resize', () => {
    if (requested) { queued = { section: requested, focus: false, animate: false }; animation?.abort(); }
  }, options);
  reduced.addEventListener('change', () => {
    const section = requested ?? sectionAtTravel(readTravel(), !reduced.matches);
    animation?.abort(); void go(section, false);
  }, options);
  current();
  const initialFrame = requestAnimationFrame(() => followLocation(false));
  return () => {
    disposed = true; queued = undefined; animation?.abort(); controller.abort(); cancelAnimationFrame(initialFrame);
    history.scrollRestoration = previousRestoration;
    root.removeAttribute('data-navigating');
    stage.inert = false;
  };
}
