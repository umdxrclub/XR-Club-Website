import { mountPointerTilt, pointerTiltTransform } from '../../lib/pointerTilt';

export function mountProjectCabinets() {
  const controller = new AbortController();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const options = { signal: controller.signal };
  const cleanups: (() => void)[] = [];
  document.querySelectorAll<HTMLElement>('[data-project-cabinet]').forEach(cabinet => {
    const panels = [...cabinet.querySelectorAll<HTMLElement>('[data-project-panel]')];
    const overview = cabinet.querySelector<HTMLElement>('[data-project-overview]')!;
    const picker = cabinet.querySelector<HTMLElement>('[data-project-picker]')!;
    const toggle = cabinet.querySelector<HTMLButtonElement>('[data-project-picker-toggle]')!;
    const choices = [...cabinet.querySelectorAll<HTMLButtonElement>('[data-project-choice]')];
    const explore = cabinet.querySelector<HTMLButtonElement>('[data-enter-project]')!;
    let selected = 0;
    let animations: Animation[] = [];
    const folder = overview.querySelector<HTMLElement>('.project-folder')!;
    const tilt = mountPointerTilt(value => { folder.style.transform = pointerTiltTransform(value, 3.5, 4.5, 1800); });
    // Keep the landing pose ready while the scroll story is still in flight.
    const syncTilt = () => tilt.setEnabled(!overview.hidden && !overview.inert);
    const stateObserver = new MutationObserver(syncTilt);
    stateObserver.observe(overview, { attributes: true, attributeFilter: ['hidden', 'inert'] });

    function stopAnimations() {
      animations.forEach(animation => animation.cancel()); animations = [];
      panels.forEach((panel, index) => {
        panel.hidden = index !== selected; panel.inert = index !== selected; panel.style.zIndex = '';
        panel.querySelectorAll('video').forEach(video => video.pause());
      });
    }
    function closePicker(focus = false) {
      picker.hidden = true; toggle.setAttribute('aria-expanded', 'false');
      if (focus) toggle.focus({ preventScroll: true });
    }
    function select(index: number, focus = false) {
      if (index < 0 || index >= panels.length) return;
      const entering = cabinet.hasAttribute('data-overview');
      const previous = selected, direction = index >= previous ? 1 : -1;
      closePicker(); stopAnimations(); selected = index;
      cabinet.removeAttribute('data-overview'); overview.hidden = true; overview.inert = true;
      syncTilt();
      choices.forEach((choice, i) => { if (i === index) choice.setAttribute('aria-current', 'true'); else choice.removeAttribute('aria-current'); });
      const incoming = panels[index], outgoing = panels[previous];
      incoming.hidden = false; incoming.inert = false; incoming.style.zIndex = '3';
      if ((entering || index !== previous) && !reduced.matches) {
        if (!entering && incoming !== outgoing) {
          outgoing.hidden = false; outgoing.inert = true; outgoing.style.zIndex = '2';
          const leave = outgoing.animate([{ opacity: 1, transform: 'translate3d(0,0,0)' }, { opacity: 0, transform: `translate3d(${-direction * 20}px,5px,-10px)` }], { duration: 170, easing: 'ease-out', fill: 'both' });
          leave.onfinish = () => { outgoing.hidden = true; leave.cancel(); };
          animations.push(leave);
        }
        animations.push(incoming.animate([
          { opacity: 0, transform: `translate3d(${direction * 24}px,-10px,0) rotateY(${-direction * 2}deg)` },
          { opacity: 1, transform: 'translate3d(0,0,0) rotateY(0deg)' },
        ], { duration: 360, easing: 'cubic-bezier(.2,.75,.22,1)' }));
      }
      if (focus) incoming.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
    }
    function showOverview(animate = false, focus = false) {
      closePicker(); stopAnimations(); selected = 0;
      cabinet.setAttribute('data-overview', ''); overview.hidden = false; overview.inert = false;
      syncTilt();
      panels.forEach(panel => { panel.inert = true; });
      if (animate && !reduced.matches) animations.push(overview.animate([
        { opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 260, easing: 'cubic-bezier(.2,.75,.22,1)' }));
      if (focus) explore.focus({ preventScroll: true });
    }
    toggle.addEventListener('click', () => {
      if (!picker.hidden) { closePicker(); return; }
      picker.hidden = false; toggle.setAttribute('aria-expanded', 'true');
      if (!reduced.matches) animations.push(picker.animate([{ opacity: 0, transform: 'translateY(-5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 170, easing: 'ease-out' }));
      choices[selected].focus({ preventScroll: true });
    }, options);
    choices.forEach((choice, index) => {
      choice.addEventListener('click', () => select(index, true), options);
      choice.addEventListener('keydown', event => {
        const step = event.key === 'ArrowDown' ? 2 : event.key === 'ArrowUp' ? -2 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + step + choices.length) % choices.length;
        if (!step && !['Home','End'].includes(event.key)) return;
        event.preventDefault(); choices[next].focus({ preventScroll: false });
      }, options);
    });
    cabinet.addEventListener('keydown', event => { if (event.key === 'Escape' && !picker.hidden) { event.preventDefault(); closePicker(true); } }, options);
    document.addEventListener('pointerdown', event => {
      if (event.target instanceof Node && !picker.contains(event.target) && !toggle.contains(event.target)) closePicker();
    }, options);
    cabinet.addEventListener('focusout', event => {
      if (event.relatedTarget instanceof Node && !picker.contains(event.relatedTarget) && !toggle.contains(event.relatedTarget)) closePicker();
    }, options);
    explore.addEventListener('click', () => {
      // The home story can complete its flight before opening the first folder.
      const enter = () => select(0, true);
      const event = new CustomEvent('xr:project-story-enter', { bubbles: true, cancelable: true, detail: { enter } });
      if (cabinet.dispatchEvent(event)) enter();
    }, options);
    cabinet.querySelectorAll('[data-project-back]').forEach(button => button.addEventListener('click', () => showOverview(true, true), options));
    cabinet.addEventListener('xr:project-story-reset', () => showOverview(), options);
    if (cabinet.hasAttribute('data-overview')) showOverview();
    syncTilt();
    cleanups.push(() => { stateObserver.disconnect(); tilt.dispose(); stopAnimations(); });
  });
  return () => { cleanups.forEach(cleanup => cleanup()); controller.abort(); };
}
