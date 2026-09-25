import { liquidPath, type LiquidOrigin } from '../projects/projectStoryMotion';

export function mountHomeSculpture(element: HTMLElement) {
  const root = element.closest<HTMLElement>('[data-home-waves]')!;
  const stage = root.querySelector<HTMLElement>('[data-home-waves-stage]')!;
  const gallery = root.querySelector<HTMLElement>('[data-home-gallery]')!;
  const photo = root.querySelector<HTMLElement>('[data-home-carousel]')!;
  const statement = root.querySelector<HTMLElement>('.home-statement-block')!;
  const funding = root.querySelector<HTMLElement>('[data-home-funding]')!;
  const title = root.querySelector<HTMLElement>('.home-statement')!;
  const controller = new AbortController();
  let width = 1, height = 1, frame = 0, disposed = false, previous = '';
  let background = Number(root.style.getPropertyValue('--project-background')) || 0;
  let origin: LiquidOrigin = {
    x: Number(root.style.getPropertyValue('--project-origin-x')) || .72,
    y: Number(root.style.getPropertyValue('--project-origin-y')) || .54,
    radius: Number(root.style.getPropertyValue('--project-origin-radius')) || 4,
  };

  function draw() {
    const visible = background < 1;
    element.style.visibility = visible ? '' : 'hidden';
    const clip = background <= 0 || !visible ? ''
      : `path(evenodd, 'M-1 -1H${width + 1}V${height + 1}H-1Z${liquidPath(background, width, height, origin)}')`;
    if (clip !== previous) { element.style.clipPath = clip; previous = clip; }
  }
  function measure() {
    frame = 0;
    if (disposed) return;
    width = stage.clientWidth; height = stage.clientHeight;
    if (gallery.hasAttribute('data-flight')) { draw(); return; }
    const stageBox = stage.getBoundingClientRect();
    // Continue through the footer to the viewport edge.
    const floor = height;
    const titleBox = title.getBoundingClientRect();
    const statementBox = statement.getBoundingClientRect();
    const narrow = width <= 640;
    let size = Math.min(600, width * (narrow ? .43 : .46), height * .70);
    const rail = (narrow ? titleBox.left : statementBox.left) - stageBox.left - (narrow ? 18 : 38);
    size = Math.min(size, Math.max(72, rail / 1.094));
    if (narrow) {
      const buttonBottom = funding.getBoundingClientRect().bottom - stageBox.top;
      size = Math.min(size, Math.max(72, (floor - buttonBottom - 18) / .87));
    } else {
      const left = parseFloat(photo.style.getPropertyValue('--photo-left')) || photo.offsetLeft;
      if (left < size * 1.094 + 24) {
        const top = parseFloat(photo.style.getPropertyValue('--photo-top')) || photo.offsetTop;
        const photoWidth = parseFloat(photo.style.getPropertyValue('--photo-width')) || photo.clientWidth;
        const proportions = [...photo.querySelectorAll<HTMLImageElement>('img')].map(image =>
          Number(image.getAttribute('height')) / Number(image.getAttribute('width'))).filter(Number.isFinite);
        const tallest = Math.max(2 / 3, ...proportions);
        size = Math.min(size, Math.max(72, (floor - top - photoWidth * tallest - 24) / .87));
      }
    }
    element.style.setProperty('--sculpture-size', `${Math.round(size)}px`);
    root.dispatchEvent(new CustomEvent('xr:sculpture-layout', { detail: { size: Math.round(size) } }));
    draw();
  }
  function requestMeasure() { if (!frame && !disposed) frame = requestAnimationFrame(measure); }
  root.addEventListener('xr:project-progress', event => {
    const detail = (event as CustomEvent<{ background: number; origin: LiquidOrigin }>).detail;
    background = detail.background; origin = detail.origin; draw();
  }, { signal: controller.signal });
  gallery.addEventListener('xr:carousel-layout', requestMeasure, { signal: controller.signal });
  const resize = new ResizeObserver(requestMeasure);
  resize.observe(stage); resize.observe(statement);
  document.fonts.ready.then(requestMeasure);
  measure();
  return () => {
    disposed = true; controller.abort(); resize.disconnect(); cancelAnimationFrame(frame);
    element.style.removeProperty('--sculpture-size'); element.style.removeProperty('visibility'); element.style.removeProperty('clip-path');
  };
}
