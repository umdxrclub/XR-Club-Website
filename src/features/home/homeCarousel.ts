import { mountPointerTilt, pointerTiltTransform } from '../../lib/pointerTilt';
import { waveAccent, waveLayers } from './waveSettings';
import { folderContour, folderMask, portraitPhotoContour, portraitPhotoMask } from '../../lib/folderShape';

export function mountHomeCarousel(gallery: HTMLElement) {
  const carousel = gallery.querySelector<HTMLElement>('[data-home-carousel]')!;
  const slides = [...carousel.querySelectorAll<HTMLAnchorElement>('[data-gallery-photo]')];
  const contour = carousel.querySelector<SVGPathElement>('.home-gallery__contour path')!;
  const viewer = gallery.querySelector<HTMLDialogElement>('[data-photo-viewer]')!;
  const fullImage = viewer.querySelector<HTMLImageElement>('[data-photo-image]')!;
  const header = document.querySelector<HTMLElement>('[data-header]')!;
  const brand = header.querySelector<HTMLElement>('.site-header__brand')!;
  const statement = document.querySelector<HTMLElement>('.home-statement-block')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const ratios = slides.map(slide => {
    const image = slide.querySelector('img')!;
    return Number(slide.dataset.photoRatio) || Number(image.getAttribute('width')) / Number(image.getAttribute('height'));
  });
  let current = 0, photoWidth = 0, timer = 0, layoutFrame = 0;
  let fontsReady = document.fonts.status === 'loaded', layoutReady = false;
  let changing = false, disposed = false, hovered = false, focused = false, visible = true, suspended = gallery.inert;
  let chatOpen = Boolean(document.querySelector('.chat__panel--open'));
  let previousOverflow: string | undefined;
  let animations: Animation[] = [];
  let settleChange: (() => void) | undefined;
  let touchStart: { x: number; y: number } | undefined;
  let suppressClickUntil = 0;
  const tilt = mountPointerTilt(value => { carousel.style.transform = pointerTiltTransform(value, 5, 7); });

  function layout(notify = true) {
    layoutFrame = 0;
    if (disposed || suspended) return;
    // Keep one large photo anchored below the header. Its original proportions
    // determine the frame; each image fades in without shrinking into a collage.
    tilt.reset();
    const bounds = gallery.getBoundingClientRect();
    const left = brand.getBoundingClientRect().left - bounds.left;
    const top = header.getBoundingClientRect().bottom - bounds.top + 22;
    const ratio = ratios[current];
    carousel.style.setProperty('--photo-mask', current === 0 ? portraitPhotoMask : folderMask);
    contour.setAttribute('d', current === 0 ? portraitPhotoContour : folderContour);
    const unit = 900 * Math.max(bounds.width / 1600, bounds.height / 900) * Math.SQRT2;
    const nearestAccent = waveLayers[waveAccent.layer].boundary - .055 - .014 - waveAccent.maxWidth;
    const edge = (bounds.width + bounds.height) / 2 + nearestAccent * unit - 28;
    const stacked = bounds.width <= 900 && bounds.height >= 600;
    const statementBox = statement.getBoundingClientRect();
    const footerTop = document.querySelector('.site-footer')?.getBoundingClientRect().top ?? bounds.bottom;
    const right = stacked ? bounds.width - left : Math.min(bounds.width - left, statementBox.left - bounds.left - 28);
    const bottom = Math.min(footerTop - bounds.top - 22, stacked ? statementBox.top - bounds.top - 22 : bounds.height - 24);
    const edgeLimit = stacked ? right - left : (edge - left - top) / (1 + 1 / ratio);
    photoWidth = Math.max(1, Math.min(right - left, edgeLimit, (bottom - top) * ratio));
    carousel.style.setProperty('--photo-left', `${left}px`);
    carousel.style.setProperty('--photo-top', `${top}px`);
    carousel.style.setProperty('--photo-width', `${photoWidth}px`);
    carousel.style.height = `${photoWidth / ratio}px`;
    if (fontsReady) {
      layoutReady = true;
      gallery.removeAttribute('data-layout-pending');
    }
    if (notify) gallery.dispatchEvent(new CustomEvent('xr:carousel-layout'));
  }
  const observer = new ResizeObserver(() => { if (!changing && !layoutFrame) layoutFrame = requestAnimationFrame(() => layout()); });
  const visibility = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); });
  const warmedSlides = new WeakSet<HTMLImageElement>();
  function warmSlide(index: number) {
    const image = slides[(index + slides.length) % slides.length].querySelector('img')!;
    if (warmedSlides.has(image)) return;
    warmedSlides.add(image);
    // Hidden lazy images need promotion before decode can start their request.
    image.loading = 'eager';
    void image.decode().catch(() => undefined);
  }
  function schedule() {
    window.clearTimeout(timer);
    tilt.setEnabled(layoutReady && !disposed && !suspended && !changing && !chatOpen && visible && !viewer.open);
    if (layoutReady && !disposed && !suspended && !changing && !chatOpen && !hovered && !focused && visible && !viewer.open && !document.hidden && !reduced.matches) {
      // Prepare only the next slide; later slides stay lazy until their turn.
      warmSlide(current + 1);
      timer = window.setTimeout(() => void show(current + 1), 1600);
    }
  }
  async function show(index: number, manual = false) {
    if (disposed || changing || suspended || chatOpen) return;
    const next = (index + slides.length) % slides.length;
    if (next === current) return;
    changing = true; tilt.setEnabled(false); window.clearTimeout(timer);
    const outgoing = slides[current], incoming = slides[next];
    const image = incoming.querySelector('img')!;
    image.loading = 'eager';
    try { await image.decode(); } catch { /* Use the already requested image. */ }
    if (disposed || suspended || chatOpen) { changing = false; schedule(); return; }
    const moveFocus = manual && carousel.contains(document.activeElement);
    outgoing.tabIndex = -1;
    outgoing.setAttribute('aria-hidden', 'true');
    incoming.hidden = false; incoming.tabIndex = 0;
    incoming.removeAttribute('aria-hidden');
    incoming.style.zIndex = '2';
    const previousWidth = carousel.offsetWidth;
    const previousHeight = carousel.offsetHeight;
    const previousTop = getComputedStyle(carousel).top;
    current = next;
    layout(false);
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      outgoing.hidden = true;
      incoming.style.zIndex = '';
      animations.forEach(animation => animation.cancel()); animations = [];
      changing = false;
      if (settleChange === settle) settleChange = undefined;
      if (!suspended) layout();
      if (moveFocus) incoming.focus({ preventScroll: true });
      schedule();
    };
    settleChange = settle;
    if (!reduced.matches) {
      const timing = { duration: 520, easing: 'cubic-bezier(.25,.1,.25,1)', fill: 'both' as FillMode };
      animations = [
        incoming.animate([{ opacity: 0 }, { opacity: 1 }], timing),
        carousel.animate([
          { width: `${previousWidth}px`, height: `${previousHeight}px`, top: previousTop },
          { width: carousel.style.getPropertyValue('--photo-width'), height: carousel.style.height, top: carousel.style.getPropertyValue('--photo-top') },
        ], timing),
      ];
      await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
    }
    if (disposed) return;
    settle();
  }
  function restoreScroll() {
    if (previousOverflow !== undefined) { document.body.style.overflow = previousOverflow; previousOverflow = undefined; }
    schedule();
  }
  slides.forEach(slide => slide.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (performance.now() < suppressClickUntil || changing) return;
    fullImage.src = slide.href;
    fullImage.alt = slide.querySelector('img')?.alt || '';
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    viewer.showModal(); schedule();
  }, options));
  carousel.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovered = true; schedule(); } }, options);
  carousel.addEventListener('pointerleave', () => { hovered = false; schedule(); }, options);
  carousel.addEventListener('focusin', () => { focused = true; schedule(); }, options);
  carousel.addEventListener('focusout', event => { focused = carousel.contains(event.relatedTarget as Node | null); schedule(); }, options);
  carousel.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); void show(current + (event.key === 'ArrowLeft' ? -1 : 1), true);
    }
  }, options);
  carousel.addEventListener('touchstart', event => {
    const touch = event.touches[0]; touchStart = { x: touch.clientX, y: touch.clientY };
    window.clearTimeout(timer);
  }, { ...options, passive: true });
  carousel.addEventListener('touchend', event => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x, dy = touch.clientY - touchStart.y;
    touchStart = undefined;
    if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      suppressClickUntil = performance.now() + 600;
      void show(current + (dx < 0 ? 1 : -1), true);
    } else schedule();
  }, { ...options, passive: true });
  carousel.addEventListener('touchcancel', () => { touchStart = undefined; schedule(); }, options);
  gallery.addEventListener('xr:carousel-freeze', event => {
    suspended = Boolean((event as CustomEvent<boolean>).detail);
    if (suspended) {
      tilt.setEnabled(false);
      // Finish the photo and its dimensions in the same event, before the
      // scroll story reads its bounds and turns this card into the flight.
      animations.forEach(animation => animation.finish());
      settleChange?.();
      window.clearTimeout(timer);
    } else layout();
    schedule();
  }, options);
  window.addEventListener('xr:chat-state', event => {
    chatOpen = Boolean((event as CustomEvent<boolean>).detail);
    if (chatOpen) {
      tilt.setEnabled(false);
      animations.forEach(animation => animation.finish());
      settleChange?.();
    } else if (!suspended) layout();
    schedule();
  }, options);
  viewer.querySelector('[data-photo-close]')?.addEventListener('click', () => viewer.close(), options);
  viewer.addEventListener('click', event => { if (event.target === viewer) viewer.close(); }, options);
  viewer.addEventListener('close', restoreScroll, options);
  document.addEventListener('visibilitychange', schedule, options);
  reduced.addEventListener('change', () => { if (reduced.matches) animations.forEach(animation => animation.finish()); schedule(); }, options);
  document.fonts.ready.then(() => {
    if (disposed) return;
    fontsReady = true;
    layout(); schedule();
  });
  layout(); observer.observe(gallery); observer.observe(header); observer.observe(statement); visibility.observe(carousel); schedule();
  return () => {
    disposed = true; window.clearTimeout(timer); cancelAnimationFrame(layoutFrame);
    animations.forEach(animation => animation.cancel());
    settleChange = undefined;
    observer.disconnect(); visibility.disconnect(); listeners.abort(); tilt.dispose();
    viewer.close(); restoreScroll();
  };
}
