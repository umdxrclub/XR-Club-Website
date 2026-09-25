export type PointerTilt = { x: number; y: number };

// Only run while a fine pointer is moving toward a new pose. Keeping this local
// to the card leaves its parent's scroll-driven transform untouched.
export function mountPointerTilt(apply: (value: PointerTilt) => void, initiallyEnabled = false) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const value = { x: 0, y: 0 };
  let target = { x: 0, y: 0 }, pointer: PointerTilt | undefined;
  let enabled = initiallyEnabled, disposed = false, frame = 0, lastTime = 0;
  const allowed = () => enabled && fine.matches && !reduced.matches && !document.hidden && !disposed;

  function reset() {
    cancelAnimationFrame(frame); frame = 0; lastTime = 0;
    target = { x: 0, y: 0 };
    if (value.x || value.y) { value.x = 0; value.y = 0; apply(value); }
  }
  function wake() {
    if (!allowed()) { reset(); return; }
    if (!frame && (target.x !== value.x || target.y !== value.y)) frame = requestAnimationFrame(tick);
  }
  function tick(now: number) {
    frame = 0;
    if (!allowed()) { reset(); return; }
    const dt = lastTime ? Math.min(50, now - lastTime) : 16.667;
    lastTime = now;
    const ease = 1 - Math.exp(-dt / 115);
    value.x += (target.x - value.x) * ease;
    value.y += (target.y - value.y) * ease;
    if (Math.abs(target.x - value.x) + Math.abs(target.y - value.y) < .0002) {
      value.x = target.x; value.y = target.y; lastTime = 0;
    }
    apply(value); wake();
  }
  function retarget() {
    if (!allowed()) { reset(); return; }
    target = pointer ? { ...pointer } : { x: 0, y: 0 };
    wake();
  }
  window.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    pointer = {
      x: Math.max(-1, Math.min(1, event.clientX / Math.max(1, window.innerWidth) * 2 - 1)),
      y: Math.max(-1, Math.min(1, event.clientY / Math.max(1, window.innerHeight) * 2 - 1)),
    };
    retarget();
  }, { ...options, passive: true });
  const leave = () => { pointer = undefined; retarget(); };
  document.documentElement.addEventListener('pointerleave', leave, options);
  window.addEventListener('blur', () => { pointer = undefined; reset(); }, options);
  document.addEventListener('visibilitychange', retarget, options);
  fine.addEventListener('change', retarget, options);
  reduced.addEventListener('change', retarget, options);

  return {
    value,
    reset,
    setEnabled(next: boolean) {
      if (enabled === next) return;
      enabled = next; retarget();
    },
    dispose() { disposed = true; listeners.abort(); reset(); },
  };
}

export function pointerTiltTransform(value: PointerTilt, pitch = 4, yaw = 6, perspective = 1400) {
  return value.x || value.y
    ? `perspective(${perspective}px) rotateX(${(-value.y * pitch).toFixed(4)}deg) rotateY(${(value.x * yaw).toFixed(4)}deg)`
    : '';
}
