import { phase } from '../projects/projectStoryMotion';

/** The parent story supplies the viewport and scroll coordinate to every layer. */
export function mountSkyWorld(element: HTMLElement) {
  const track = element.querySelector<HTMLElement>('[data-sky-track]');
  const layers = Array.from(element.querySelectorAll<HTMLElement>('[data-sky-parallax]')).map(node => ({ node, depth: Number(node.dataset.skyParallax) || 0 }));
  const birds = Array.from(element.querySelectorAll<HTMLElement>('[data-sky-bird]')).map(node => ({
    node,
    start: Number(node.dataset.flightStart) || 0,
    direction: Number(node.dataset.flightDirection) || 1,
    depth: Number(node.dataset.flightDepth) || .02,
    x: parseFloat(node.style.getPropertyValue('--bird-x')) / 100,
    y: parseFloat(node.style.top) / 100,
    mobileX: parseFloat(node.style.getPropertyValue('--bird-focus-x')) / 100,
    size: parseFloat(node.style.getPropertyValue('--bird-size')),
    companion: node.hasAttribute('data-sky-companion') ? Number(node.dataset.skyCompanion) : -1,
  }));
  let width = 1, height = 1, progress = 0, active = false, reduced = false, folded = false, intro = 0, folderProgress = 0, disposed = false;
  let warming: Promise<void> | undefined;
  function warm(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (warming) return warming;
    // Start before the folder turns toward the sky, preserving full-resolution
    // artwork without competing with the first homepage photo.
    warming = Promise.all([...element.querySelectorAll<HTMLImageElement>('img')].map(async image => {
      image.loading = 'eager';
      try { await image.decode(); } catch { /* Keep the original artwork available if decoding is unsupported. */ }
    })).then(() => undefined);
    return warming;
  }
  element.dataset.skyActive = 'false';
  element.dataset.skyReduced = 'false';

  function rawPose(bird: typeof birds[number], descent: number, w: number, h: number, isReduced: boolean) {
    const narrow = w <= 640;
    const flight = Math.max(0, Math.min(1, (descent - bird.start) / .36));
    if (bird.companion >= 0) {
      const i = bird.companion, size = bird.size * (narrow ? .7 : 1);
      return {
        x: w * (narrow ? .115 : .21) + (i ? 14 : -14) - size / 2 + (isReduced ? 0 : descent * w * .35),
        y: h * (narrow ? .43 : .40) + (i ? 9 : -8) - size / 2,
        size,
      };
    }
    return {
      x: (narrow && birds.indexOf(bird) < 3 ? bird.mobileX : bird.x) * w + (isReduced ? 0 : bird.direction * (flight - .5) * w * .85),
      y: bird.y * h * 4 + (isReduced ? 0 : -Math.sin(flight * Math.PI) * h * bird.depth),
      size: bird.size * (narrow ? .7 : 1),
    };
  }
  function bounds(flock: { x: number; y: number; size: number }[]) {
    const left = Math.min(...flock.map(b => b.x)), right = Math.max(...flock.map(b => b.x + b.size));
    const top = Math.min(...flock.map(b => b.y)), bottom = Math.max(...flock.map(b => b.y + b.size));
    return { x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, height: bottom - top };
  }
  function poses(descent: number, w: number, h: number, isReduced: boolean) {
    const origin = bounds(birds.slice(0, 3).map(bird => rawPose(bird, 0, w, h, isReduced)));
    const dx = w * (w <= 640 ? .55 : .64) - origin.x, dy = h * (w <= 640 ? .34 : .5) - origin.y;
    return birds.map((bird, index) => {
      const pose = rawPose(bird, descent, w, h, isReduced);
      return { ...pose, x: pose.x + (index < 3 ? dx : 0), y: pose.y + (index < 3 ? dy : 0) };
    });
  }
  function draw() {
    if (!track || disposed) return;
    track.style.transform = `translate3d(0,${(-progress * 75).toFixed(5)}%,0)`;
    for (const { node, depth } of layers) node.style.transform = `translate3d(0,${reduced ? 0 : (progress * height * depth).toFixed(2)}px,0)`;
    const layout = poses(progress, width, height, reduced);
    birds.forEach((bird, index) => {
      const pose = layout[index];
      // The aperture stays fixed: the flock arrives from the right, rests at
      // its center, then continues left as the opening expands.
      const arriving = reduced ? 1 : phase(0, .30, intro);
      const leaving = reduced ? 0 : phase(.65, 1, intro);
      const focusX = index < 3 ? width * (.12 * (1 - arriving) - 1.12 * leaving) : 0;
      const focusY = index < 3 ? height * (.025 * (1 - arriving) - .28 * leaving) : 0;
      const companionTravel = bird.companion >= 0 && !reduced
        ? width * (-.045 + .07 * phase(.255, .70, folderProgress) + 1.1 * leaving) : 0;
      const companionLift = bird.companion >= 0 && !reduced
        ? height * (.012 * Math.sin(Math.PI * phase(.255, .70, folderProgress)) - .18 * leaving) : 0;
      const x = pose.x + focusX + companionTravel;
      const y = pose.y + focusY + companionLift;
      // Explicit coordinates avoid a second percentage-based offset on desktop.
      bird.node.style.left = '0px';
      bird.node.style.top = '0px';
      bird.node.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
    });
  }
  function resizeTo(w: number, h: number) {
    if (w <= 0 || h <= 0 || (w === width && h === height)) return false;
    width = w; height = h;
    element.style.setProperty('--sky-height', `${height}px`);
    return true;
  }
  const resize = new ResizeObserver(() => {
    if (resizeTo(element.clientWidth, element.clientHeight)) draw();
  });
  resize.observe(element);

  return {
    warm,
    focus(w: number, h: number, descent: number, isReduced: boolean) {
      const b = bounds(poses(descent, w, h, isReduced).slice(0, 3)), narrow = w <= 640;
      return {
        x: b.x, y: b.y - descent * h * 3,
        radius: Math.max(Math.hypot(b.width, b.height) / 2 + 20, Math.min(w * (narrow ? .31 : .16), h * (narrow ? .20 : .245))),
      };
    },
    update(descent: number, isActive: boolean, reduceMotion: boolean, viewport?: { width: number; height: number }, isFolded = false, storyIntro = 0, transitionProgress = 0) {
      if (disposed) return;
      if (active !== isActive) { active = isActive; element.dataset.skyActive = String(active); }
      if (folded !== isFolded) { folded = isFolded; element.dataset.skyFolded = String(folded); }
      const resized = viewport ? resizeTo(viewport.width, viewport.height) : false;
      const reducedChanged = reduced !== reduceMotion;
      if (reducedChanged) { reduced = reduceMotion; element.dataset.skyReduced = String(reduced); }
      const next = Math.max(0, Math.min(1, Number.isFinite(descent) ? descent : 0));
      const nextIntro = Math.max(0, Math.min(1, storyIntro));
      const reading = String(nextIntro >= 1);
      if (element.dataset.skyReading !== reading) element.dataset.skyReading = reading;
      const nextFolder = Math.max(0, Math.min(1, transitionProgress));
      if (next !== progress || reducedChanged || resized || intro !== nextIntro || folderProgress !== nextFolder) {
        progress = next; intro = nextIntro; folderProgress = nextFolder; draw();
      }
    },
    dispose() {
      disposed = true; resize.disconnect();
      element.dataset.skyActive = 'false';
      delete element.dataset.skyReduced; delete element.dataset.skyFolded; delete element.dataset.skyReading;
      track?.style.removeProperty('transform');
      element.style.removeProperty('--sky-height');
      for (const { node } of layers) node.style.removeProperty('transform');
      for (const bird of birds) {
        bird.node.style.removeProperty('transform'); bird.node.style.removeProperty('left');
        bird.node.style.top = `${bird.y * 100}%`;
      }
    },
  };
}
