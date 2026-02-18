import gsap from 'gsap';
import { $ } from '../utils/dom';

const base = import.meta.env.BASE_URL;

const TOTAL_FRAMES = 130;
const AUTO_SPEED = 0.0008;
const SCENE_DURATIONS = { background: 150, split: 55 };
const TOTAL = SCENE_DURATIONS.background + SCENE_DURATIONS.split;
const PHASE_END = { background: SCENE_DURATIONS.background / TOTAL };

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function initIntro(onComplete: () => void) {
  const bgImage = $<HTMLImageElement>('#bg-image');
  const bgContainer = $('#bg-container');
  const splitScene = $('#split-scene');
  const splitBlack = $('#split-black');
  const intro = $('[data-intro]');

  if (!bgImage || !bgContainer || !splitScene || !splitBlack || !intro) return;

  const preloadHero = new Image();
  preloadHero.src = `${base}Images/photo4.jpg`;
  const preloadLogo = new Image();
  preloadLogo.src = `${base}Images/XR Logo.png`;
  const criticalReady = Promise.all([
    preloadHero.decode().catch(() => {}),
    preloadLogo.decode().catch(() => {}),
  ]);

  let maxLoadedFrame = 0;
  const frames: HTMLImageElement[] = [];

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const img = new Image();
    img.src = `${base}background/${String(i).padStart(4, '0')}.png`;
    img.onload = () => {
      if (i === maxLoadedFrame) {
        while (maxLoadedFrame < TOTAL_FRAMES && frames[maxLoadedFrame]?.complete) {
          maxLoadedFrame++;
        }
      }
    };
    frames.push(img);
  }

  let progress = 0;
  let done = false;
  let transitionStarted = false;
  let slicePlayed = false;

  function update(p: number) {
    if (p <= PHASE_END.background) {
      const frameProgress = p / PHASE_END.background;
      const idx = Math.floor(frameProgress * (TOTAL_FRAMES - 1));

      if (frames[idx]?.complete) {
        bgImage!.src = frames[idx].src;
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

    const footer = $('[data-footer]') as HTMLElement;
    const csLogo = intro!.querySelector('.intro__cs-logo') as HTMLImageElement;
    const imdmLogo = intro!.querySelector('.intro__imdm-logo') as HTMLImageElement;

    const csStart = csLogo.getBoundingClientRect();
    const imdmStart = imdmLogo.getBoundingClientRect();

    if (footer) {
      footer.style.visibility = 'visible';
      footer.style.opacity = '1';
    }
    const footerCSImg = footer?.querySelector('[data-footer-logo-left] .footer__logo') as HTMLElement;
    const footerIMDMImg = footer?.querySelector('[data-footer-logo-right] .footer__logo') as HTMLElement;
    const csEnd = footerCSImg?.getBoundingClientRect();
    const imdmEnd = footerIMDMImg?.getBoundingClientRect();
    if (footer) {
      footer.style.visibility = 'hidden';
      footer.style.opacity = '0';
    }

    const fixLogo = (logo: HTMLImageElement, rect: DOMRect) => {
      logo.style.cssText = `
        position: fixed;
        z-index: 10000;
        pointer-events: none;
        left: 0;
        top: 0;
        width: ${rect.width}px;
        height: ${rect.height}px;
        transform: translate(${rect.left}px, ${rect.top}px);
        will-change: transform;
        opacity: 1;
        max-height: none;
        max-width: none;
        transition: none;
      `;
      document.body.appendChild(logo);
    };

    fixLogo(csLogo, csStart);
    fixLogo(imdmLogo, imdmStart);

    if (footer) {
      footer.style.visibility = 'visible';
      footer.style.opacity = '1';
    }

    const tl = gsap.timeline({
      delay: 0.3,
      onComplete: () => {
        csLogo.remove();
        imdmLogo.remove();
        criticalReady.then(() => {
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

    if (csEnd) {
      tl.to(csLogo, {
        x: csEnd.left,
        y: csEnd.top,
        width: csEnd.width,
        height: csEnd.height,
        duration: 1,
        ease: 'power2.inOut',
      }, 0.2);
    }

    if (imdmEnd) {
      tl.to(imdmLogo, {
        x: imdmEnd.left,
        y: imdmEnd.top,
        width: imdmEnd.width,
        height: imdmEnd.height,
        duration: 1,
        ease: 'power2.inOut',
      }, 0.2);
    }
  }

  function loop() {
    if (!done) {
      const frameProgress = progress / PHASE_END.background;
      const targetFrame = Math.floor(frameProgress * (TOTAL_FRAMES - 1));

      if (progress <= PHASE_END.background && targetFrame >= maxLoadedFrame) {
        requestAnimationFrame(loop);
        return;
      }

      progress = Math.min(progress + AUTO_SPEED, 1);
      update(progress);
      requestAnimationFrame(loop);
    } else {
      startTransition();
    }
  }

  loop();
}
