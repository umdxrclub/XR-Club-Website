import { clamp, mix, phase, projectFlight, liquidPath, type StoryBox } from './projectStoryMotion';
import { mountPointerTilt, pointerTiltTransform } from '../../lib/pointerTilt';
import { mountSkyJourney } from '../sky/skyJourney';

export function mountProjectStory(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>('[data-home-waves-stage]')!;
  const gallery = root.querySelector<HTMLElement>('[data-home-gallery]')!;
  const carousel = root.querySelector<HTMLElement>('[data-home-carousel]')!;
  const flight = root.querySelector<HTMLElement>('[data-project-flight]')!;
  const reverse = root.querySelector<HTMLElement>('[data-project-reverse]')!;
  const scene = root.querySelector<HTMLElement>('[data-project-scene]')!;
  const landing = root.querySelector<HTMLElement>('[data-project-landing]')!;
  const details = root.querySelector<HTMLElement>('[data-project-details]')!;
  const intro = details.querySelector<HTMLElement>('.cabinet__intro')!;
  const actions = details.querySelector<HTMLElement>('.cabinet__actions')!;
  const statement = root.querySelector<HTMLElement>('.home-statement-block')!;
  const dot = root.querySelector<HTMLElement>('.home-statement__period')!;
  const dotAnchor = dot.cloneNode(false) as HTMLElement;
  dotAnchor.style.visibility = 'hidden'; dotAnchor.setAttribute('aria-hidden', 'true');
  const initialDotStyle = dot.getAttribute('style');
  const dotColor = getComputedStyle(dot).backgroundColor;
  const header = document.querySelector<HTMLElement>('[data-header]')!;
  const fallback = root.querySelector<HTMLElement>('.home-waves__next')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController(), options = { signal: listeners.signal };
  let source: StoryBox = { x: 0, y: 0, width: 1, height: 1 }, destination = { ...source };
  let width = 1, height = 1, distance = 1, start = 0;
  let origin = { x: .72, y: .54, radius: 4 };
  let statementBox = { x: 0, y: 0, width: 1, height: 1 };
  let progress = 0, frame = 0, lastTime = 0, frozen = false, disposed = false;
  let travel = 0, targetTravel = 0, navigationHeld = false;
  let lastAriaProgress = -1;
  let afterStory = 0;
  let measureVersion = 0, lastProjectPose = '';
  let pendingEntry: (() => void) | null = null;
  root.classList.add('has-project-story');
  const skyJourney = mountSkyJourney(root);
  let flightPose: { x: number; y: number; rotateY: number; rotateZ: number; progress: number } | undefined;
  // Follow the pointer before takeoff, so freezing the slideshow only hands
  // its cursor pose to the moving card instead of cancelling the interaction.
  const flightTilt = mountPointerTilt(drawFlight, true);
  function drawFlight() {
    if (!flightPose) return;
    const { x, y, rotateY, rotateZ, progress: p } = flightPose;
    const tilt = pointerTiltTransform(flightTilt.value, mix(5, 3.5, p), mix(7, 4.5, p), mix(1400, 1800, p));
    style(flight, 'transform', `translate3d(${x}px, ${y}px, 0) ${tilt} rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`);
  }

  function style(element: HTMLElement, property: string, value: string) {
    if (element.style.getPropertyValue(property) === value) return;
    if (value) element.style.setProperty(property, value); else element.style.removeProperty(property);
  }
  function attribute(element: HTMLElement, name: string, present: boolean) {
    if (element.hasAttribute(name) !== present) element.toggleAttribute(name, present);
  }
  function inert(element: HTMLElement, value: boolean) { if (element.inert !== value) element.inert = value; }
  function data(key: string, value: string) { if (root.dataset[key] !== value) root.dataset[key] = value; }

  function captureSource() {
    const stageBox = stage.getBoundingClientRect();
    if (!gallery.hasAttribute('data-flight')) {
      const box = carousel.getBoundingClientRect();
      source = { x: box.left - stageBox.left, y: box.top - stageBox.top, width: box.width, height: box.height };
    } else {
      source = { x: parseFloat(carousel.style.getPropertyValue('--photo-left')) || source.x,
        y: parseFloat(carousel.style.getPropertyValue('--photo-top')) || source.y,
        width: parseFloat(carousel.style.getPropertyValue('--photo-width')) || source.width,
        height: parseFloat(carousel.style.height) || source.height };
    }
    const box = landing.getBoundingClientRect();
    if (box.width > 0) destination = { x: box.left - stageBox.left, y: box.top - stageBox.top + afterStory, width: box.width, height: box.height };
  }
  function measure() {
    measureVersion++;
    const stageBox = stage.getBoundingClientRect();
    width = stage.clientWidth; height = stage.clientHeight;
    start = root.getBoundingClientRect().top + window.scrollY;
    distance = height * (reduced.matches ? .9 : 1.8);
    captureSource();
    const dotBox = (dotAnchor.isConnected ? dotAnchor : dot).getBoundingClientRect();
    origin = { x: (dotBox.left + dotBox.width / 2 - stageBox.left) / width,
      y: (dotBox.top + dotBox.height / 2 - stageBox.top) / height, radius: dotBox.width / 2 };
    style(root, '--project-origin-x', String(origin.x));
    style(root, '--project-origin-y', String(origin.y));
    style(root, '--project-origin-radius', String(origin.radius));
    const box = statement.getBoundingClientRect();
    statementBox = { x: box.left - stageBox.left, y: box.top - stageBox.top, width: box.width, height: box.height };
    request();
  }
  function restoreDot() {
    if (!dotAnchor.isConnected) return;
    dotAnchor.replaceWith(dot);
    if (initialDotStyle === null) dot.removeAttribute('style'); else dot.setAttribute('style', initialDotStyle);
    dot.removeAttribute('aria-hidden');
  }
  function morphDot(p: number, background: number) {
    if (p <= .0001 || reduced.matches) { restoreDot(); return; }
    if (!dotAnchor.isConnected) { dot.before(dotAnchor); stage.append(dot); }
    if (root.classList.contains('has-clean-waves')) {
      // The GPU draws this same dot, including its original color, as the reveal.
      style(dot, 'visibility', 'hidden');
      if (dot.getAttribute('aria-hidden') !== 'true') dot.setAttribute('aria-hidden', 'true');
      return;
    }
    // This is the original period element. Keep its place in the word with an
    // invisible anchor while its silhouette expands into the reveal surface.
    const properties = {
      position: 'absolute', left: '0', top: '0', margin: '0', display: 'block',
      width: `${width}px`, height: `${height}px`, 'border-radius': '0', 'z-index': '3', 'pointer-events': 'none',
      'background-color': dotColor,
      'clip-path': `path('${liquidPath(background, width, height, origin)}')`,
      opacity: String(1 - phase(.006, .07, p)),
      visibility: p < .07 ? 'visible' : 'hidden',
    };
    for (const [property, value] of Object.entries(properties)) style(dot, property, value);
    if (dot.getAttribute('aria-hidden') !== 'true') dot.setAttribute('aria-hidden', 'true');
  }
  function projectPose(p: number, isReduced: boolean, force = false) {
    const cleanReady = root.classList.contains('has-clean-waves');
    const key = `${p}:${measureVersion}:${isReduced}:${cleanReady}:${afterStory}`;
    if (!force && key === lastProjectPose) return;
    lastProjectPose = key;
    // The liquid belongs to the background. Keep white foreground surfaces out
    // of a changing viewport-sized clip and a redundant transformed ancestor.
    style(scene, 'clip-path', '');
    style(scene, 'transform', afterStory ? `translateY(${-afterStory}px)` : '');
    if (frozen !== (p > .0001)) {
      frozen = p > .0001;
      gallery.dispatchEvent(new CustomEvent('xr:carousel-freeze', { detail: frozen }));
      if (frozen) captureSource();
      inert(gallery, frozen); inert(statement, frozen);
    }
    if (p < .999 && scene.hasAttribute('data-arrived')) {
      scene.querySelector('[data-project-cabinet]')?.dispatchEvent(new CustomEvent('xr:project-story-reset'));
      captureSource();
    }
    const state = projectFlight(p, source, destination);
    const background = state.background, finished = p >= .999;
    attribute(scene, 'data-arrived', finished);
    morphDot(p, background);
    // The browser evaluates both faces in the real perspective transform.
    // A numeric 90-degree cutoff can disagree with that projected handoff.
    style(carousel, 'visibility', ''); style(reverse, 'visibility', '');
    if (!isReduced && p > .0001 && !finished) {
      attribute(gallery, 'data-flight', true);
      style(flight, 'width', `${state.width}px`); style(flight, 'height', `${state.height}px`);
      flightPose = { ...state, progress: p };
      drawFlight();
    } else {
      flightPose = undefined;
      attribute(gallery, 'data-flight', false); style(flight, 'transform', ''); style(carousel, 'opacity', '');
    }
    style(gallery, 'visibility', finished ? 'hidden' : '');
    style(gallery, 'opacity', isReduced ? String(1 - phase(.1, .65, p)) : '1');
    if (isReduced) {
      style(statement, 'clip-path', ''); style(statement, 'opacity', String(1 - background));
      style(scene, 'opacity', String(background));
    } else {
      const hole = liquidPath(background, width, height, origin, statementBox.x, statementBox.y);
      style(statement, 'clip-path', p <= .0001 ? '' : `path(evenodd, 'M-100 -100H${statementBox.width + 100}V${statementBox.height + 100}H-100Z${hole}')`);
      style(statement, 'opacity', '');
      style(scene, 'opacity', '1');
    }
    style(statement, 'visibility', background >= 1 ? 'hidden' : '');
    style(scene, 'pointer-events', p > .4 ? 'auto' : 'none'); inert(scene, p <= .4);
    style(landing, 'opacity', finished ? '1' : isReduced ? String(phase(.55, .9, p)) : '0');
    style(details, 'opacity', '1');
    style(intro, 'opacity', String(phase(.68, .92, p)));
    style(actions, 'opacity', String(phase(.40, .70, p)));
    inert(details, p <= .4);
    if (!cleanReady) {
      style(fallback, 'opacity', background > 0 ? '1' : '0');
      style(fallback, 'clip-path', background >= 1 ? '' : `path('${liquidPath(background, width, height, origin)}')`);
    }
    style(root, '--project-background', String(background));
    style(root, '--project-scene-shade', String(background));
    data('storyProgress', p.toFixed(4));
    data('footerTone', background > .16 ? 'dark' : 'light');
  }
  function render(frameTime = performance.now()) {
    const p = progress, isReduced = reduced.matches;
    afterStory = skyJourney ? 0 : Math.max(0, window.scrollY - start - distance);
    const skyOwned = Boolean(skyJourney && root.dataset.skyPhase && root.dataset.skyPhase !== 'projects');
    if (!skyOwned || p < .999) projectPose(p, isReduced);
    const background = phase(0, .93, p);
    const animating = !isReduced && Math.abs(targetTravel - travel) > .00001;
    root.dispatchEvent(new CustomEvent('xr:project-progress', { detail: { background, origin, frameTime, animating } }));
    skyJourney?.update({ offset: Math.max(0, travel - distance / height), width, height, landing: destination, reduced: isReduced });
    // Sky owns the faded details and interaction during its flip. Restore the
    // complete Projects pose once it releases ownership on reverse scroll.
    if (skyOwned && root.dataset.skyPhase === 'projects') projectPose(p, isReduced, true);
    const ariaProgress = isReduced ? 0 : clamp((travel - distance / height) / 1.35);
    if (ariaProgress !== lastAriaProgress) {
      lastAriaProgress = ariaProgress;
      data('ariaProgress', String(ariaProgress));
      root.dispatchEvent(new CustomEvent('xr:aria-progress', { detail: { progress: ariaProgress } }));
    }
    data('storyTravel', travel.toFixed(5));
    root.dispatchEvent(new CustomEvent('xr:story-position', { detail: { travel } }));
    if (p >= .999 && pendingEntry) {
      const enter = pendingEntry; pendingEntry = null; enter();
    }
  }
  function request() {
    if (disposed) return;
    if (navigationHeld) return;
    targetTravel = Math.max(0, (window.scrollY - start) / height);
    if (!frame && !document.hidden) { lastTime = performance.now(); frame = requestAnimationFrame(tick); }
  }
  function tick(now: number) {
    frame = 0;
    if (disposed) return;
    const dt = Math.min(.05, Math.max(.001, (now - lastTime) / 1000)); lastTime = now;
    travel = reduced.matches ? targetTravel : travel + (targetTravel - travel) * (1 - Math.exp(-dt / .04));
    if (Math.abs(targetTravel - travel) < .00002) travel = targetTravel;
    // One eased scroll coordinate keeps both scenes synchronized on fast jumps
    // and on reverse scroll through the handoff.
    progress = clamp(travel * height / distance);
    render(now);
    if (Math.abs(targetTravel - travel) > .00001) frame = requestAnimationFrame(tick);
  }
  // Header navigation owns this same renderer temporarily, independently of
  // scroll. Commit only its final position; the sticky stage never moves.
  root.addEventListener('xr:story-seek', event => {
    const { travel: next, commit = false, hold = true } = (event as CustomEvent<{ travel: number; commit?: boolean; hold?: boolean }>).detail;
    if (!Number.isFinite(next)) return;
    cancelAnimationFrame(frame); frame = 0; pendingEntry = null;
    navigationHeld = true;
    travel = targetTravel = Math.max(0, next);
    progress = clamp(travel * height / distance);
    render();
    if (commit) window.scrollTo({ top: start + travel * height, behavior: 'instant' });
    navigationHeld = hold;
    if (!hold) request();
  }, options);
  const observer = new ResizeObserver(measure);
  observer.observe(stage); observer.observe(header);
  root.addEventListener('xr:project-story-enter', event => {
    if (progress >= .999) return;
    event.preventDefault();
    pendingEntry = (event as CustomEvent<{ enter: () => void }>).detail.enter;
    window.scrollTo({ top: start + distance, behavior: reduced.matches ? 'instant' : 'smooth' });
  }, options);
  window.addEventListener('wheel', event => { if (event.deltaY < 0) pendingEntry = null; }, { ...options, passive: true });
  window.addEventListener('touchstart', () => { pendingEntry = null; }, { ...options, passive: true });
  window.addEventListener('scroll', request, { ...options, passive: true });
  root.addEventListener('xr:clean-waves-ready', () => {
    // GPU cleanup can happen while scroll is settled. Restore the current
    // fallback mask immediately instead of exposing its old pre-GPU state.
    if (!root.classList.contains('has-clean-waves')) render();
    request();
  }, options);
  gallery.addEventListener('xr:carousel-layout', measure, options);
  window.addEventListener('resize', measure, { ...options, passive: true });
  document.addEventListener('visibilitychange', request, options);
  reduced.addEventListener('change', measure, options);
  document.fonts.ready.then(() => { if (!disposed) measure(); });
  measure(); travel = targetTravel; progress = clamp(travel * height / distance); render();
  return () => {
    disposed = true; pendingEntry = null; cancelAnimationFrame(frame); observer.disconnect(); listeners.abort();
    flightPose = undefined; flightTilt.dispose();
    skyJourney?.dispose();
    details.inert = false;
    gallery.dispatchEvent(new CustomEvent('xr:carousel-freeze', { detail: false }));
    gallery.removeAttribute('data-flight'); gallery.inert = false; statement.inert = false; header.inert = false;
    restoreDot();
    for (const element of [gallery, carousel, flight, reverse, scene, landing, details, intro, actions, statement, header, fallback]) {
      for (const property of ['opacity', 'visibility', 'transform', 'pointer-events', 'clip-path']) element.style.removeProperty(property);
    }
    root.classList.remove('has-project-story');
    for (const property of ['--project-background', '--project-scene-shade', '--project-origin-x', '--project-origin-y', '--project-origin-radius']) root.style.removeProperty(property);
    delete root.dataset.storyProgress;
    delete root.dataset.storyTravel;
    delete root.dataset.ariaProgress;
    delete root.dataset.footerTone;
  };
}
