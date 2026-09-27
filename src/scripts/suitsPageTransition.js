(() => {
  if (window.__xrSuitsPageTransition) return;
  window.__xrSuitsPageTransition = true;
  const html = document.documentElement;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const suits = value => {
    try { return /\/suits\/(?:team|workspace|preview)(?:\/|$)/.test(new URL(value, location.href).pathname); }
    catch { return false; }
  };
  const connected = (from,to) => !!from && !!to && (suits(from) || suits(to));
  const cleanup = () => html.removeAttribute('data-suits-navigation');
  let active = Promise.resolve();
  const smooth = t => t * t * t * (t * (t * 6 - 15) + 10);
  // Match projectStoryMotion's liquid edge and the existing scene transition timing.
  function frames(width, height, compact) {
    const x = width * .5, y = height * .52;
    const reach = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
    if (compact) return [
      '50% 50% 50% 50% / 50% 50% 50% 50%',
      '42% 58% 46% 54% / 56% 44% 58% 42%',
      '54% 46% 58% 42% / 43% 57% 44% 56%',
      '47% 53% 45% 55% / 54% 46% 52% 48%',
      '50% 50% 50% 50% / 50% 50% 50% 50%',
    ].map((round, index) => {
      const radius = Math.max(.1, reach * 1.6 * smooth(index / 4));
      return {clipPath: `inset(${y-radius}px ${width-x-radius}px ${height-y-radius}px ${x-radius}px round ${round})`, offset: index / 4};
    });
    const phase = (start, end, value) => smooth(Math.max(0, Math.min(1, (value-start)/(end-start))));
    return Array.from({length: 61}, (_, index) => {
      const progress = smooth(index / 60), radius = reach * 1.13 * progress;
      const fluid = phase(.005, .12, progress) * (1 - phase(.75, 1, progress));
      const points = Array.from({length:160}, (_, i) => {
        const a = i / 160 * Math.PI * 2;
        const r = radius * (1 + fluid * (.18*Math.sin(a*3+progress*2) + .07*Math.sin(a*5-progress*3) + .045*Math.sin(a*9+progress*4)));
        return `${(x+Math.cos(a)*r).toFixed(2)} ${(y-Math.sin(a)*r).toFixed(2)}`;
      });
      return {clipPath: `path('M${points.join('L')}Z')`, offset:index/60};
    });
  }

  async function animate(transition) {
    if (reduced()) { transition.skipTransition(); cleanup(); return; }
    let animation;
    try {
      await transition.ready;
      const compact=matchMedia('(max-width: 900px), (pointer: coarse)').matches;
      animation=html.animate(frames(innerWidth,innerHeight,compact), {
        duration:compact?850:1200,easing:'linear',fill:'both',pseudoElement:'::view-transition-new(root)',
      });
      await animation.finished;
    } catch { /* Navigation, resizing, or reduced motion can interrupt an animation. */ }
    finally { transition.skipTransition(); await transition.finished.catch(()=>{}); animation?.cancel(); cleanup(); }
  }
  // Astro keeps the old document visible while loading the next page and its artwork.
  // Never hide the old page or animate the incoming page over an empty body.
  document.addEventListener('astro:before-preparation', event => {
    if (!connected(event.from?.href,event.to?.href)) return;
    const load=event.loader;
    event.loader=async()=>{
      await load();
      const source=event.newDocument.querySelector('.st-bg__astronaut')?.getAttribute('src');
      if(source) { const image=new Image();image.src=new URL(source,event.to).href;await image.decode().catch(()=>{}); }
    };
  });
  document.addEventListener('astro:before-swap', event => {
    if (!connected(event.from?.href,event.to?.href) || reduced() || !document.startViewTransition) return;
    html.setAttribute('data-suits-navigation','');
    event.newDocument.documentElement.setAttribute('data-suits-navigation','');
    active=animate(event.viewTransition);
  });
  window.xrSuitsReveal=async update=>{
    await active;
    if(reduced() || !document.startViewTransition) { await update(); return; }
    html.setAttribute('data-suits-navigation','');
    const transition=document.startViewTransition(update);
    active=animate(transition);
    await active;
  };
  // Native snapshots also cover direct same-origin navigations such as auth callbacks.
  window.addEventListener('pageswap', event=>{
    const transition=event.viewTransition;if(!transition)return;
    if(reduced() || !connected(location.href,event.activation?.entry?.url)){transition.skipTransition();return;}
    html.setAttribute('data-suits-navigation','');transition.finished.finally(cleanup);
  });
  window.addEventListener('pagereveal',event=>{
    const transition=event.viewTransition;if(!transition)return;
    const from=window.navigation?.activation?.from?.url;
    if(reduced() || !connected(from,location.href)){transition.skipTransition();cleanup();return;}
    html.setAttribute('data-suits-navigation','');active=animate(transition);
  });
})();
