type ChromeTarget = {
  element: HTMLElement;
  kind: 'brand' | 'header' | 'footer' | 'discord';
  property: 'filter' | 'color';
  originalValue: string;
  originalPriority: string;
  appliedValue: string | null;
  x: number;
  y: number;
};

export function mountStoryChrome(root: HTMLElement) {
  const document = root.ownerDocument;
  const targets: ChromeTarget[] = [];
  const add = (element: HTMLElement | null, kind: ChromeTarget['kind']) => {
    if (!element) return;
    const property = kind === 'brand' ? 'filter' : 'color';
    targets.push({
      element, kind, property,
      originalValue: element.style.getPropertyValue(property),
      originalPriority: element.style.getPropertyPriority(property),
      appliedValue: null, x: 0, y: 0,
    });
  };
  add(document.querySelector<HTMLImageElement>('.site-header__brand img'), 'brand');
  document.querySelectorAll<HTMLElement>('.site-header__nav a').forEach(element => add(element, 'header'));
  document.querySelectorAll<HTMLElement>('.site-footer nav a').forEach(element => {
    add(element, element.classList.contains('site-footer__discord') ? 'discord' : 'footer');
  });
  let active = false, measuredWidth = 0, measuredHeight = 0;

  const restore = () => {
    for (const target of targets) {
      const { element, property, originalValue, originalPriority } = target;
      target.appliedValue = null;
      if (element.style.getPropertyValue(property) === originalValue && element.style.getPropertyPriority(property) === originalPriority) continue;
      if (originalValue) element.style.setProperty(property, originalValue, originalPriority);
      else element.style.removeProperty(property);
    }
  };

  return {
    update(nextActive: boolean, width: number, height: number, isPaper: (x: number, y: number) => boolean, ground: boolean) {
      if (!nextActive) {
        if (active) restore();
        active = false;
        return;
      }
      if (!active || width !== measuredWidth || height !== measuredHeight) {
        measuredWidth = width; measuredHeight = height;
        for (const target of targets) {
          const box = target.element.getBoundingClientRect();
          target.x = box.left + box.width / 2;
          target.y = box.top + box.height / 2;
        }
      }
      active = true;
      for (const target of targets) {
        const paper = isPaper(target.x, target.y);
        const value = target.kind === 'brand' ? paper ? 'invert(1)' : 'none'
          : target.kind === 'header' ? paper ? '#211b13' : '#f5f6f7'
          : target.kind === 'discord' ? paper || ground ? '#414ca9' : '#7887ff'
          : paper ? '#392919' : ground ? '#15395e' : '#f5f6f7';
        if (target.appliedValue !== value) {
          target.element.style.setProperty(target.property, value);
          target.appliedValue = value;
        }
      }
    },
    dispose() { if (active) restore(); active = false; },
  };
}
