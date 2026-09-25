import type { Box } from './prismMotion';

export type TitlePaint = { size: number; opacity: number; lines: { text: string; x: number; y: number }[] };
type Layer = { image: HTMLImageElement; host: HTMLElement; opacity: number; flip: boolean };
type Scenery = { image: HTMLImageElement; opacity: number };
type Stop = { color: string; at: number };

const parseOrigin = (value: string) => { const [x, y] = value.split(' ').map(parseFloat); return { x: x || 0, y: y || 0 }; };
const parseStops = (value: string): Stop[] => [...value.matchAll(/(rgba?\([^)]*\))\s+([\d.]+)%/g)].map(match => ({ color: match[1], at: parseFloat(match[2]) / 100 }));
const ready = (image: HTMLImageElement) => image.complete && image.naturalWidth > 0;

/**
 * Redraws the sky layers behind the prism into a small canvas, so the glass
 * refracts the same clouds, birds and horizon the page shows around it.
 * Positions come from the live DOM, including the drift animations.
 */
export function createSkyCapture(world: HTMLElement) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  const horizonCanvas = document.createElement('canvas');
  const horizonContext = horizonCanvas.getContext('2d');
  const track = world.querySelector<HTMLElement>('[data-sky-track]');
  const horizon = world.querySelector<HTMLElement>('.sky-world__horizon');
  const landscape = world.querySelector<HTMLElement>('.sky-world__landscape');
  const layers: Layer[] = [...world.querySelectorAll<HTMLImageElement>('.sky-world__bank img, .sky-world__wisp img')].map(image => ({
    image, host: image.parentElement!,
    opacity: parseFloat(getComputedStyle(image.parentElement!).opacity) || 1,
    flip: (getComputedStyle(image).scale || 'none').startsWith('-'),
  }));
  const scenery: Scenery[] = landscape ? [...landscape.querySelectorAll<HTMLImageElement>('img')].map(image => ({ image, opacity: parseFloat(getComputedStyle(image).opacity) || 1 })) : [];
  const birds = [...world.querySelectorAll<HTMLElement>('[data-sky-bird]')].map(node => ({ node, frame: node.firstElementChild as HTMLElement | null }));
  const sprite = new Image();
  const spriteUrl = birds[0]?.frame?.style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
  if (spriteUrl) sprite.src = spriteUrl;
  let gradient: Stop[] | undefined;

  const intersects = (rect: DOMRect, region: Box, ox: number, oy: number) =>
    rect.right - ox > region.x && rect.left - ox < region.x + region.width && rect.bottom - oy > region.y && rect.top - oy < region.y + region.height;

  function paint(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number, style: CSSStyleDeclaration, flip: boolean, alpha: number) {
    const origin = parseOrigin(style.transformOrigin);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + origin.x, y + origin.y);
    if (flip) ctx.scale(-1, 1);
    if (style.transform && style.transform !== 'none') { const m = new DOMMatrix(style.transform); ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f); }
    ctx.translate(-origin.x, -origin.y);
    ctx.drawImage(image, 0, 0, w, h);
    ctx.restore();
  }

  return {
    canvas,
    /** Region in stage pixels; `limit` bounds the longest canvas side. */
    capture(region: Box, limit: number, title?: TitlePaint) {
      if (!context || region.width <= 0 || region.height <= 0) return false;
      const origin = world.getBoundingClientRect();
      const ox = origin.left, oy = origin.top;
      const scale = Math.min(limit / Math.max(region.width, region.height), Math.max(1, window.devicePixelRatio || 1), 1.5);
      const w = Math.max(1, Math.round(region.width * scale)), h = Math.max(1, Math.round(region.height * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; horizonCanvas.width = w; horizonCanvas.height = h; }
      context.setTransform(scale, 0, 0, scale, -region.x * scale, -region.y * scale);
      context.globalAlpha = 1;
      // The track's gradient continues past the visible layers.
      context.fillStyle = '#0964ec';
      if (track) {
        gradient ??= parseStops(getComputedStyle(track).backgroundImage);
        const rect = track.getBoundingClientRect();
        if (gradient.length && rect.height > 0) {
          const fill = context.createLinearGradient(0, rect.top - oy, 0, rect.bottom - oy);
          for (const stop of gradient) fill.addColorStop(Math.min(1, Math.max(0, stop.at)), stop.color);
          context.fillStyle = fill;
        }
      }
      context.fillRect(region.x, region.y, region.width, region.height);
      for (const layer of layers) {
        if (!ready(layer.image) || !intersects(layer.image.getBoundingClientRect(), region, ox, oy)) continue;
        const rect = layer.host.getBoundingClientRect();
        paint(context, layer.image, rect.left - ox, rect.top - oy, rect.width, rect.height, getComputedStyle(layer.image), layer.flip, layer.opacity);
      }
      if (horizon && landscape && horizonContext) {
        const rect = horizon.getBoundingClientRect();
        if (intersects(rect, region, ox, oy)) {
          horizonContext.setTransform(scale, 0, 0, scale, -region.x * scale, -region.y * scale);
          horizonContext.globalCompositeOperation = 'source-over';
          horizonContext.clearRect(region.x, region.y, region.width, region.height);
          const base = landscape.getBoundingClientRect();
          for (const item of scenery) {
            if (!ready(item.image)) continue;
            paint(horizonContext, item.image, base.left - ox + item.image.offsetLeft, base.top - oy + item.image.offsetTop, item.image.offsetWidth, item.image.offsetHeight, getComputedStyle(item.image), false, item.opacity);
          }
          // The horizon's soft upper edge, matching its CSS mask.
          horizonContext.globalCompositeOperation = 'destination-in';
          const fade = horizonContext.createLinearGradient(0, rect.top - oy, 0, rect.top - oy + rect.height * .18);
          fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
          horizonContext.fillStyle = fade;
          horizonContext.fillRect(region.x, region.y, region.width, region.height);
          horizonContext.globalCompositeOperation = 'source-over';
          context.save();
          context.beginPath(); context.rect(rect.left - ox, rect.top - oy, rect.width, rect.height); context.clip();
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.drawImage(horizonCanvas, 0, 0);
          context.restore();
        }
      }
      if (ready(sprite)) {
        const frameWidth = sprite.naturalWidth / 16;
        for (const bird of birds) {
          if (!bird.frame) continue;
          const rect = bird.node.getBoundingClientRect();
          if (!intersects(rect, region, ox, oy)) continue;
          const style = getComputedStyle(bird.frame);
          const step = Math.round(-parseFloat(style.backgroundPositionX) / Math.max(1, rect.width));
          const index = ((step % 16) + 16) % 16;
          const facing = style.transform !== 'none' && new DOMMatrix(style.transform).a < 0;
          context.save();
          context.translate(rect.left - ox + rect.width / 2, rect.top - oy);
          if (facing) context.scale(-1, 1);
          context.drawImage(sprite, index * frameWidth, 0, frameWidth, sprite.naturalHeight, -rect.width / 2, 0, rect.width, rect.height);
          context.restore();
        }
      }
      if (title && title.opacity > 0) {
        context.save();
        context.globalAlpha = title.opacity;
        context.fillStyle = '#fff7e8';
        context.font = `600 ${title.size.toFixed(2)}px 'Labs Display', 'Outfit', Arial, sans-serif`;
        context.textAlign = 'center'; context.textBaseline = 'middle';
        for (const line of title.lines) context.fillText(line.text, line.x, line.y);
        context.restore();
      }
      return true;
    },
    dispose() { canvas.width = canvas.height = 1; horizonCanvas.width = horizonCanvas.height = 1; },
  };
}
