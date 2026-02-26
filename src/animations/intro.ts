import gsap from 'gsap';
import { $ } from '../utils/dom';

const base = import.meta.env.BASE_URL;

const TOTAL_FRAMES = 130;
const AUTO_SPEED = 0.1;
const SCENE_DURATIONS = { background: 150, split: 55 };
const TOTAL = SCENE_DURATIONS.background + SCENE_DURATIONS.split;
const PHASE_END = { background: SCENE_DURATIONS.background / TOTAL };

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function initIntro(onComplete: () => void) {
  const bgCanvas = $<HTMLCanvasElement>('#bg-canvas');
  const bgContainer = $('#bg-container');
  const splitScene = $('#split-scene');
  const splitBlack = $('#split-black');
  const intro = $('[data-intro]');

  if (!bgCanvas || !bgContainer || !splitScene || !splitBlack || !intro) return;

  const ctx = bgCanvas.getContext('2d')!;

  const frames: (HTMLImageElement | null)[] = new Array(TOTAL_FRAMES).fill(null);
  let lastDrawnFrame = -1;

  const sizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    bgCanvas!.width = window.innerWidth * dpr;
    bgCanvas!.height = window.innerHeight * dpr;
    lastDrawnFrame = -1;
  };
  sizeCanvas();
  window.addEventListener('resize', sizeCanvas);

  const preloadHero = new Image();
  preloadHero.src = `${base}Images/photo4.webp`;
  const preloadLogo = new Image();
  preloadLogo.src = `${base}Images/XR logo.webp`;
  const criticalReady = Promise.all([
    preloadHero.decode().catch(() => {}),
    preloadLogo.decode().catch(() => {}),
  ]);

  function loadFrame(i: number) {
    if (frames[i]) return;
    const img = new Image();
    img.src = `${base}background/${String(i).padStart(4, '0')}.webp`;
    frames[i] = img;
  }

  for (let i = 0; i < Math.min(40, TOTAL_FRAMES); i++) {
    loadFrame(i);
  }

  let progress = 0;
  let done = false;
  let transitionStarted = false;
  let slicePlayed = false;

  function update(p: number) {
    if (p <= PHASE_END.background) {
      const frameProgress = p / PHASE_END.background;
      const idx = Math.floor(frameProgress * (TOTAL_FRAMES - 1));

      const img = frames[idx];
      if (img?.complete && idx !== lastDrawnFrame) {
        lastDrawnFrame = idx;
        const cw = bgCanvas!.width;
        const ch = bgCanvas!.height;
        const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      }

      bgContainer!.style.opacity = '1';
      splitScene!.classList.remove('visible');
      splitBlack!.classList.remove('slide-in');
      done = false;
    } else {
      const phaseProgress = (p - PHASE_END.background) / (1 - PHASE_END.background);

      let bgOpacity = 1;
      let splitOpacity = 0;

      if (phaseProgress < 0.15) {
        bgOpacity = 1 - easeOutCubic(phaseProgress / 0.15);
      } else if (phaseProgress < 0.35) {
        bgOpacity = 0;
      } else if (phaseProgress < 0.50) {
        bgOpacity = 0;
        splitOpacity = easeOutCubic((phaseProgress - 0.35) / 0.15);
      } else {
        bgOpacity = 0;
        splitOpacity = 1;
      }

      bgContainer!.style.opacity = String(bgOpacity);
      splitScene!.classList.add('visible');
      splitScene!.style.opacity = String(splitOpacity);

      if (phaseProgress >= 0.50) {
        splitBlack!.classList.add('slide-in');
        if (!slicePlayed) {
          slicePlayed = true;
          new Audio(`${base}slice.mp3`).play();
        }
      } else {
        splitBlack!.classList.remove('slide-in');
      }

      if (p >= 0.99) done = true;
    }
  }

  function startTransition() {
    if (transitionStarted) return;
    transitionStarted = true;

    const tl = gsap.timeline({
      delay: 0.3,
      onComplete: () => {
        criticalReady.then(() => {
          window.removeEventListener('resize', sizeCanvas);
          intro!.remove();
          onComplete();
        });
      },
    });

    tl.to(intro, {
      opacity: 0,
      duration: 0.8,
      ease: 'power2.inOut',
    }, 0);
  }

  let lastTime = 0;

  function loop(now: number) {
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (!done) {
      progress = Math.min(progress + AUTO_SPEED * dt, 1);
      update(progress);

      if (progress <= PHASE_END.background) {
        const currentIdx = Math.floor((progress / PHASE_END.background) * (TOTAL_FRAMES - 1));
        for (let i = currentIdx; i < Math.min(currentIdx + 40, TOTAL_FRAMES); i++) {
          loadFrame(i);
        }
      }

      requestAnimationFrame(loop);
    } else {
      startTransition();
    }
  }

  requestAnimationFrame(loop);
}
