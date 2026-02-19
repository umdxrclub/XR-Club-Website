import { debounce } from '../utils/dom';

const base = import.meta.env.BASE_URL;

const RENDER_TOTAL_FRAMES = 899;
const RENDER_PATH = `${base}render/FINAL/FINAL/pre_color/pre_color_`;
const RENDER_FPS = 30;

export interface FrameTrigger {
  frame: number;
  fired: boolean;
  callback: () => void;
}

export function initRenderCanvas(canvas: HTMLCanvasElement, frameTriggers: FrameTrigger[] = []) {
  const ctx = canvas.getContext('2d')!;
  const frames: (HTMLImageElement | null)[] = new Array(RENDER_TOTAL_FRAMES).fill(null);
  let currentFrame = -1;
  let playing = false;
  let animFrameId = 0;
  let lastTime = 0;
  const frameInterval = 1000 / RENDER_FPS;

  function resizeCanvas() {
    const parent = canvas.parentElement!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
