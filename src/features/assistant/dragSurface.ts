export type DockPoint = { id: string; label: string; left: number; top: number; width?: number; height?: number };
export type DockLayout = (box: DOMRect) => DockPoint[];

/** Pointer movement uses cached geometry and a compositor translation only. */
export function dragSurface(target: HTMLElement, handle: HTMLElement, signal: AbortSignal, getDocks?: DockLayout) {
  const alwaysSnap = target.matches('[data-chat-window]');
  let x = 0, y = 0, suppressUntil = 0, anchored: string | undefined;
  let overlay: HTMLElement | undefined, settle: Animation | undefined;
  let guides: HTMLElement[] = [];
  let drag: { id: number; sx: number; sy: number; x: number; y: number; baseX: number; baseY: number; width: number; height: number; minX: number; maxX: number; minY: number; maxY: number; moved: boolean; docks: DockPoint[]; active: number } | undefined;
  const options = { signal };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  function stopSettling() {
    if (!settle) return;
    const position = getComputedStyle(target).translate.split(' ');
    x = parseFloat(position[0]) || 0; y = parseFloat(position[1]) || 0;
    target.style.translate = `${x}px ${y}px`;
    if (alwaysSnap) {
      const style = getComputedStyle(target);
      target.style.width = style.width; target.style.height = style.height;
    }
    settle.cancel(); settle = undefined;
  }
  function clearGuides() {
    overlay?.remove(); overlay = undefined; guides = [];
  }
  function showGuides() {
    if (!drag?.docks.length) return;
    overlay = document.createElement('div');
    overlay.className = 'drag-docks'; overlay.setAttribute('aria-hidden', 'true');
    const inset = target.matches('[data-home-assistant]') ? 16 : 0;
    guides = drag.docks.map(dock => {
      const guide = document.createElement('div');
      guide.className = 'drag-dock'; guide.dataset.dockTarget = dock.id;
      guide.style.cssText = `left:${dock.left + inset}px;top:${dock.top + inset}px;width:${(dock.width || drag!.width) - inset * 2}px;height:${(dock.height || drag!.height) - inset * 2}px`;
      const label = document.createElement('span'); label.textContent = 'Release to place';
      guide.append(label); overlay!.append(guide); return guide;
    });
    const stage = target.closest('[data-home-waves-stage]');
    if (stage) { overlay.dataset.characterDocks = ''; stage.append(overlay); }
    else document.body.append(overlay);
  }
  function place(left: number, top: number, smooth = false) {
    const from = `${x}px ${y}px`;
    x = left; y = top; target.style.translate = `${x}px ${y}px`;
    if (smooth && !reduced.matches) {
      settle = target.animate([{ translate: from }, { translate: `${x}px ${y}px` }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
      settle.finished.then(() => { settle = undefined; }).catch(() => {});
    }
  }
  function nearest(docks: DockPoint[], box: DOMRect) {
    return docks.reduce<DockPoint | undefined>((best, dock) => {
      const distance = (point: DockPoint) => Math.hypot(point.left + (point.width || box.width) / 2 - box.left - box.width / 2,
        point.top + (point.height || box.height) / 2 - box.top - box.height / 2);
      return !best || distance(dock) < distance(best) ? dock : best;
    }, undefined);
  }
  function snapChat(dock: DockPoint, smooth: boolean, from: DOMRect) {
    const width = dock.width || from.width, height = dock.height || from.height;
    anchored = dock.id; target.dataset.docked = dock.id;
    target.toggleAttribute('data-chat-compact', width < 300 || height < 320);
    target.toggleAttribute('data-chat-tight', height < 220);
    Object.assign(target.style, { position: 'fixed', left: `${dock.left}px`, top: `${dock.top}px`, right: 'auto', bottom: 'auto', width: `${width}px`, height: `${height}px`, translate: '0px 0px' });
    x = 0; y = 0;
    if (smooth && !reduced.matches) {
      settle = target.animate([
        { translate: `${from.left - dock.left}px ${from.top - dock.top}px`, width: `${from.width}px`, height: `${from.height}px` },
        { translate: '0px 0px', width: `${width}px`, height: `${height}px` },
      ], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
      const animation = settle;
      void animation.finished.then(() => { if (settle === animation) settle = undefined; }, () => {});
    }
  }
  function dockChat(smooth = false) {
    if (!alwaysSnap || !getDocks || !target.getClientRects().length) return false;
    stopSettling();
    const box = target.getBoundingClientRect(), dock = nearest(getDocks(box), box);
    if (!dock) return false;
    snapChat(dock, smooth, box); return true;
  }
  handle.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || (event.target instanceof Element && event.target.closest('a,input,textarea,select,[data-chat-close]'))) return;
    stopSettling();
    const box = target.getBoundingClientRect();
    const footer = document.querySelector('.site-footer')?.getBoundingClientRect().height || 0;
    drag = { id: event.pointerId, sx: event.clientX, sy: event.clientY, x, y, baseX: box.left - x, baseY: box.top - y, width: box.width, height: box.height, minX: 12 - box.left + x, maxX: innerWidth - 12 - box.right + x, minY: 12 - box.top + y, maxY: innerHeight - footer - 10 - box.bottom + y, moved: false, docks: getDocks?.(box) || [], active: -1 };
    handle.setPointerCapture(event.pointerId);
  }, options);
  handle.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.sx, dy = event.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) { drag.moved = true; showGuides(); target.setAttribute('data-dragging', ''); }
    event.preventDefault();
    x = Math.max(drag.minX, Math.min(drag.maxX, drag.x + dx));
    y = Math.max(drag.minY, Math.min(drag.maxY, drag.y + dy));
    target.style.translate = `${x}px ${y}px`;
    const radius = Math.max(58, Math.min(drag.width, drag.height) * .46);
    let nearest = -1, distance = alwaysSnap ? Infinity : radius;
    drag.docks.forEach((dock, index) => {
      const d = Math.hypot(drag!.baseX + x - dock.left, drag!.baseY + y - dock.top);
      if (d < distance) { nearest = index; distance = d; }
    });
    if (nearest !== drag.active) {
      guides[drag.active]?.removeAttribute('data-active');
      guides[nearest]?.setAttribute('data-active', '');
      drag.active = nearest;
    }
  }, options);
  function finish(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    const completed = drag;
    drag = undefined;
    if (completed.moved) {
      suppressUntil = performance.now() + 350;
      const released = target.getBoundingClientRect();
      const dock = alwaysSnap ? nearest(getDocks?.(released) || completed.docks, released)
        : event.type === 'pointerup' ? completed.docks[completed.active] : undefined;
      anchored = dock?.id;
      if (dock && alwaysSnap) snapChat(dock, true, released);
      else if (dock) { target.dataset.docked = dock.id; place(dock.left - completed.baseX, dock.top - completed.baseY, true); }
      else target.removeAttribute('data-docked');
    }
    clearGuides(); target.removeAttribute('data-dragging');
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  }
  handle.addEventListener('pointerup', finish, options);
  handle.addEventListener('pointercancel', finish, options);
  handle.addEventListener('lostpointercapture', finish, options);
  handle.addEventListener('click', event => {
    if (performance.now() < suppressUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, { signal, capture: true });
  window.addEventListener('resize', () => {
    settle?.cancel(); settle = undefined; clearGuides(); drag = undefined;
    target.removeAttribute('data-dragging');
    if (alwaysSnap) { dockChat(); return; }
    x = 0; y = 0; target.style.translate = '';
    if (!anchored || !getDocks || !target.getClientRects().length) return;
    const box = target.getBoundingClientRect();
    const dock = getDocks(box).find(dock => dock.id === anchored);
    if (dock) place(dock.left - box.left, dock.top - box.top);
    else { anchored = undefined; target.removeAttribute('data-docked'); }
  }, options);
  signal.addEventListener('abort', () => { clearGuides(); settle?.cancel(); }, { once: true });
  return { dock: dockChat };
}
