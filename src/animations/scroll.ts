import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $ } from '../utils/dom';
import { debounce } from '../utils/dom';

gsap.registerPlugin(ScrollTrigger);
gsap.config({ force3D: true });

const base = import.meta.env.BASE_URL;

const RENDER_TOTAL_FRAMES = 899;
const RENDER_PATH = `${base}render/FINAL/FINAL/pre_color/pre_color_`;
const RENDER_FPS = 30;

interface FrameTrigger {
  frame: number;
  fired: boolean;
  callback: () => void;
}

function initRenderCanvas(canvas: HTMLCanvasElement, frameTriggers: FrameTrigger[] = []) {
  const ctx = canvas.getContext('2d')!;
  const frames: (HTMLImageElement | null)[] = new Array(RENDER_TOTAL_FRAMES).fill(null);
  let currentFrame = -1;
  let playing = false;
  let animFrameId = 0;
  let lastTime = 0;
  const frameInterval = 1000 / RENDER_FPS;

  function resizeCanvas() {
    const parent = canvas.parentElement!;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = parent.clientWidth * dpr;
    canvas.height = parent.clientHeight * dpr;
    drawFrame(currentFrame);
  }

  function getFrameSrc(i: number): string {
    return `${RENDER_PATH}${String(i).padStart(5, '0')}.jpg`;
  }

  function drawFrame(idx: number) {
    if (idx < 0 || idx >= RENDER_TOTAL_FRAMES) return;
    const img = frames[idx];
    if (!img || !img.complete) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const scale = Math.max(cw / iw, ch / ih);
    const sw = iw * scale;
    const sh = ih * scale;
    const sx = (cw - sw) / 2;
    const sy = (ch - sh) / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, sx, sy, sw, sh);
  }

  function preloadRange(start: number, end: number) {
    const s = Math.max(0, start);
    const e = Math.min(RENDER_TOTAL_FRAMES - 1, end);
    for (let i = s; i <= e; i++) {
      if (!frames[i]) {
        const img = new Image();
        img.src = getFrameSrc(i);
        frames[i] = img;
      }
    }
  }

  preloadRange(0, 60);

  function loop(timestamp: number) {
    if (!playing) return;

    if (timestamp - lastTime >= frameInterval) {
      lastTime = timestamp;
      const next = currentFrame + 1;
      if (next < RENDER_TOTAL_FRAMES) {
        if (frames[next]?.complete) {
          currentFrame = next;
          drawFrame(currentFrame);

          for (const trigger of frameTriggers) {
            if (!trigger.fired && currentFrame >= trigger.frame) {
              trigger.fired = true;
              trigger.callback();
            }
          }
        }
        preloadRange(currentFrame, currentFrame + 120);
      } else {
        playing = false;
        return;
      }
    }

    animFrameId = requestAnimationFrame(loop);
  }

  function start() {
    if (playing) return;
    playing = true;
    if (currentFrame < 0) currentFrame = 0;
    animFrameId = requestAnimationFrame(loop);
  }

  function stop() {
    playing = false;
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = 0;
    }
  }

  const firstFrame = frames[0]!;
  if (firstFrame.complete) {
    currentFrame = 0;
    resizeCanvas();
  } else {
    firstFrame.onload = () => {
      currentFrame = 0;
      resizeCanvas();
    };
  }

  window.addEventListener('resize', debounce(resizeCanvas, 150));

  return { start, stop };
}

export function initScrollAnimations() {
  const main = $('[data-main]');
  const hero = $('[data-hero]');
  const heroTitle = $('[data-hero-title]');
  const header = $('[data-header]');
  const render = $('[data-render]');
  const about = $('[data-about]');
  const renderCanvas = $<HTMLCanvasElement>('[data-render-canvas]');

  const projects = $('[data-projects]');
  const lab = $('[data-lab]');
  const events = $('[data-events]');
  const board = $('[data-board]');
  const resources = $('[data-resources]');

  if (!main || !hero || !render || !about) return;

  if (projects) gsap.set(projects, { visibility: 'visible' });
  if (lab) gsap.set(lab, { visibility: 'visible' });
  if (events) gsap.set(events, { visibility: 'visible' });
  if (board) gsap.set(board, { visibility: 'visible' });
  if (resources) gsap.set(resources, { visibility: 'visible' });

  const renderBuild = $('[data-render-build]', render);
  const renderCommunity = $('[data-render-community]', render);
  const renderOverlay = $('[data-render-overlay]', render);
  const renderStartBtn = $('[data-render-start]', render);

  const aboutContent = $('[data-about-content]', about);
  const aboutHeader = $('[data-about-header]', about);
  const aboutGrid = $('[data-about-grid]', about);

  const skippingIntro = document.documentElement.dataset.skipIntro === 'true';
  if (!skippingIntro) gsap.set(header, { opacity: 0 });
  gsap.set(render, { scale: 0.4, x: '150%', y: '20%', zIndex: 0 });
  gsap.set(about, { scale: 0.4, x: '-150%', y: '20%', zIndex: 0 });
  if (aboutContent) gsap.set(aboutContent, { yPercent: 100 });
  if (renderBuild) gsap.set(renderBuild, { autoAlpha: 0, x: 80 });
  if (renderCommunity) gsap.set(renderCommunity, { autoAlpha: 0, x: 80 });
  if (renderCanvas) gsap.set(renderCanvas, { autoAlpha: 0 });

  const totalUnits = 4.0;
  const totalScrollVh = totalUnits * 150;

  let bookFallFired = false;
  let bookFallTl: gsap.core.Timeline | null = null;

  const frameTriggers: FrameTrigger[] = [];

  if (renderBuild) {
    frameTriggers.push({
      frame: 435,
      fired: false,
      callback: () => {
        gsap.to(renderBuild, {
          x: 0,
          autoAlpha: 1,
          duration: 0.5,
          ease: 'power2.out',
        });
      },
    });
    frameTriggers.push({
      frame: 569,
      fired: false,
      callback: () => {
        gsap.to(renderBuild, {
          autoAlpha: 0,
          duration: 0.4,
          ease: 'power2.in',
        });
      },
    });
  }

  if (renderCommunity) {
    frameTriggers.push({
      frame: 704,
      fired: false,
      callback: () => {
        gsap.to(renderCommunity, {
          x: 0,
          autoAlpha: 1,
          duration: 0.5,
          ease: 'power2.out',
        });
      },
    });
    frameTriggers.push({
      frame: 810,
      fired: false,
      callback: () => {
        gsap.to(renderCommunity, {
          autoAlpha: 0,
          duration: 0.4,
          ease: 'power2.in',
        });
      },
    });
  }

  const immersedSound = new Audio(`${base}immersed.mp3`);
  immersedSound.preload = 'auto';
  const scifiAudio = new Audio(`${base}scifi.mp3`);
  scifiAudio.preload = 'auto';

  frameTriggers.push({
    frame: 160,
    fired: false,
    callback: () => {
      if (bootupSound) {
        gsap.to(bootupSound, { volume: 0, duration: 1, ease: 'power2.in', onComplete: () => { bootupSound!.pause(); } });
      }
      immersedSound.currentTime = 0;
      immersedSound.play();
    },
  });

  frameTriggers.push({
    frame: 178,
    fired: false,
    callback: () => {
      if (immersedSound) {
        gsap.to(immersedSound, { volume: 0, duration: 0.6, ease: 'power2.in', onComplete: () => { immersedSound.pause(); } });
      }
      scifiAudio.currentTime = 26.6;
      scifiAudio.play();
    },
  });

  frameTriggers.push({
    frame: 780,
    fired: false,
    callback: () => {
      gsap.to(scifiAudio, { volume: 0, duration: 3.9, ease: 'none' });
    },
  });

  const glitchPool = Array.from({ length: 3 }, () => {
    const a = new Audio(`${base}glitch.mp3`);
    a.preload = 'auto';
    return a;
  });
  let glitchIdx = 0;

  const glitchRanges = [161, 239, 399, 553, 636, 742];
  for (const frame of glitchRanges) {
    frameTriggers.push({
      frame,
      fired: false,
      callback: () => {
        const glitch = glitchPool[glitchIdx % glitchPool.length];
        glitchIdx++;
        glitch.currentTime = 0;
        glitch.play();
      },
    });
  }

  frameTriggers.push({
    frame: RENDER_TOTAL_FRAMES - 1,
    fired: false,
    callback: () => {
      renderPlayer?.stop();
      bookFallFired = true;

      scifiAudio.pause();

      gsap.set(about, { visibility: 'visible', scale: 1, x: '0%', y: '0%', zIndex: 0 });
      if (aboutContent) gsap.set(aboutContent, { yPercent: 0 });
      gsap.set(render, { zIndex: 2 });

      bookFallTl = gsap.timeline({
        onComplete: () => {
          if (header) {
            gsap.to(header, {
              y: 0,
              opacity: 1,
              duration: 0.6,
              ease: 'power2.out',
            });
          }
          if (footer) {
            gsap.to(footer, {
              y: 0,
              opacity: 1,
              visibility: 'visible',
              duration: 0.6,
              ease: 'power2.out',
            });
          }

          const st = tl.scrollTrigger;
          if (st) {
            gsap.set(render, { clipPath: 'none', zIndex: 0 });

            const targetProgress = 3.95 / totalUnits;
            tl.progress(targetProgress);

            const aboutPos = st.start + targetProgress * (st.end - st.start);
            st.scroll(aboutPos);

            gsap.set(about, { visibility: 'visible', scale: 1, x: '0%', y: '0%' });
            if (aboutContent) gsap.set(aboutContent, { yPercent: 0 });
            if (aboutHeader) gsap.set(aboutHeader, { x: 0, y: 0, autoAlpha: 1 });
            aboutCards.forEach(card => {
              gsap.set(card, { x: 0, y: 0, autoAlpha: 1 });
            });
          }
        },
      });

      bookFallTl.fromTo(render,
        { clipPath: 'inset(0% 0% 0% 0%)' },
        {
          clipPath: 'inset(100% 0% 0% 0%)',
          duration: 1.5,
          ease: 'power2.in',
        }
      );

      if (aboutHeader) {
        bookFallTl.fromTo(aboutHeader, { x: -120, autoAlpha: 0 }, {
          x: 0, autoAlpha: 1, duration: 0.7, ease: 'power2.out',
        }, 0.2);
      }
      aboutCards.forEach((card, i) => {
        bookFallTl!.fromTo(card, { x: 120, autoAlpha: 0 }, {
          x: 0, autoAlpha: 1, duration: 0.7, ease: 'power2.out',
        }, 0.3 + i * 0.1);
      });
    },
  });

  let renderPlayer: { start: () => void; stop: () => void } | null = null;
  if (renderCanvas) {
    renderPlayer = initRenderCanvas(renderCanvas, frameTriggers);
  }

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: main,
      start: 'top top',
      end: `+=${totalScrollVh}%`,
      scrub: 1.5,
      pin: true,
      anticipatePin: 1,
      fastScrollEnd: true,
      onUpdate: (self) => {
        const progress = self.progress * totalUnits;

        if (self.direction === -1 && bookFallFired) {
          if (progress < 3.4) {
            bookFallFired = false;

            if (bookFallTl) {
              bookFallTl.kill();
              bookFallTl = null;
            }

            gsap.set(render, { clipPath: 'none', visibility: 'visible' });

            if (aboutHeader) gsap.killTweensOf(aboutHeader);
            aboutCards.forEach(c => gsap.killTweensOf(c));
          }
        }

        if (progress > 2.0) {
          renderPlayer?.stop();
        }
      },
    },
  });

  gsap.set(header, { opacity: 1 });

  if (heroTitle) {
    tl.to(heroTitle, {
      autoAlpha: 0,
      duration: 0.3,
      ease: 'power2.in',
    }, 0);
  }

  tl.to(hero, {
    scale: 0.35,
    duration: 0.5,
    ease: 'power2.inOut',
  }, 0);

  tl.set(render, { visibility: 'visible' }, 0.45);

  tl.to(hero, {
    x: '-100%',
    y: '-10%',
    duration: 0.6,
    ease: 'power1.inOut',
  }, 0.5);

  tl.to(render, {
    x: '0%',
    y: '0%',
    duration: 0.6,
    ease: 'power1.inOut',
  }, 0.5);

  tl.to(render, {
    scale: 1,
    duration: 0.5,
    ease: 'power2.inOut',
  }, 1.0);

  let bootupSound: HTMLAudioElement | null = null;

  const footer = $('[data-footer]');

  if (renderStartBtn && renderOverlay) {
    renderStartBtn.addEventListener('click', () => {
      gsap.to(renderOverlay, {
        autoAlpha: 0,
        duration: 0.6,
        ease: 'power2.inOut',
        onComplete: () => {
          renderOverlay.style.pointerEvents = 'none';
        },
      });
      if (renderCanvas) {
        gsap.to(renderCanvas, {
          autoAlpha: 1,
          duration: 0.6,
          ease: 'power2.inOut',
        });
      }

      if (header) {
        gsap.to(header, {
          y: -80,
          opacity: 0,
          duration: 0.6,
          ease: 'power2.inOut',
        });
      }
      if (footer) {
        gsap.to(footer, {
          y: 80,
          opacity: 0,
          duration: 0.6,
          ease: 'power2.inOut',
        });
      }

      bootupSound = new Audio(`${base}bootup.mp3`);
      bootupSound.play();

      renderPlayer?.start();
    });
  }

  tl.to(render, {
    scale: 0.35,
    duration: 0.5,
    ease: 'power2.inOut',
  }, 2.0);

  tl.set(about, { visibility: 'visible' }, 2.45);

  tl.to(render, {
    x: '100%',
    y: '-10%',
    duration: 0.6,
    ease: 'power1.inOut',
  }, 2.5);

  tl.to(about, {
    x: '0%',
    y: '0%',
    duration: 0.6,
    ease: 'power1.inOut',
  }, 2.5);

  tl.to(about, {
    scale: 1,
    duration: 0.5,
    ease: 'power2.inOut',
  }, 3.0);

  if (aboutContent) {
    tl.to(aboutContent, {
      yPercent: 0,
      duration: 0.4,
      ease: 'power2.out',
    }, 3.2);
  }

  if (aboutHeader) {
    tl.fromTo(aboutHeader, {
      x: -120,
      autoAlpha: 0,
    }, {
      x: 0,
      autoAlpha: 1,
      duration: 0.3,
      ease: 'power2.out',
    }, 3.3);
  }

  const aboutCards = aboutGrid ? aboutGrid.querySelectorAll('[data-about-card]') : [];

  if (aboutGrid) {
    aboutCards.forEach((card, i) => {
      tl.fromTo(card, {
        x: 120,
        autoAlpha: 0,
      }, {
        x: 0,
        autoAlpha: 1,
        duration: 0.25,
        ease: 'power2.out',
      }, 3.4 + i * 0.08);
    });
  }

  const handleResize = debounce(() => {
    tl.scrollTrigger?.refresh();
  }, 200);

  window.addEventListener('resize', handleResize);
}
