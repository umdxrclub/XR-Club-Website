(() => {
  if (window.__xrSuitsPageTransition) return;
  window.__xrSuitsPageTransition = true;
  const html = document.documentElement;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const suits = value => {
    try { return /\/suits\/(?:team|workspace|dashboard|preview)(?:\/|$)/.test(new URL(value, location.href).pathname); }
    catch { return false; }
  };
  // The scrolling homepage and its section addresses, which stay hidden until their opening frame is ready.
  const scene = value => {
    try { return /^\/(?:(?:about|projects|equipment)\/?)?$/.test(new URL(value, location.href).pathname); }
    catch { return false; }
  };
  // The funding page shares the liquid reveal.
  const apply = value => {
    try { return /\/(?:ideate|apply)\/?$/.test(new URL(value, location.href).pathname); }
    catch { return false; }
  };
  const connected = (from,to) => !!from && !!to && (suits(from) || suits(to) || apply(from) || apply(to));
  // Full-page arrivals hold only in Chromium: WebKit crashed rendering this homepage inside such a transition.
  const documentHold = () => !!globalThis.navigator?.userAgentData;
  const cleanup = () => { html.removeAttribute('data-suits-navigation'); html.removeAttribute('data-home-arrival'); };
  let active = Promise.resolve();
  // Ends a held dashboard entry (see astro:before-swap); unset when nothing is held.
  let held;
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

  // Resolves once the arriving homepage shows its opening frame; its own fallback reveals within 10 s.
  const arrival = () => new Promise(resolve => {
    const done = () => { clearTimeout(timer); document.removeEventListener('xr:home-visible', done); resolve(); };
    const timer = setTimeout(done, 11000);
    document.addEventListener('xr:home-visible', done);
  });
  // While data-home-arrival is set, PageTransitions' CSS holds the outgoing page's snapshot on screen.
  async function animate(transition, ready) {
    if (reduced()) { transition.skipTransition(); cleanup(); return; }
    let animation;
    try {
      await transition.ready;
      if (ready) { await Promise.race([ready, transition.finished]); html.removeAttribute('data-home-arrival'); }
      const compact=matchMedia('(max-width: 900px), (pointer: coarse)').matches;
      animation=html.animate(frames(innerWidth,innerHeight,compact), {
        duration:compact?850:1200,easing:'linear',fill:'both',pseudoElement:'::view-transition-new(root)',
      });
      await animation.finished;
    } catch { /* Navigation, resizing, or reduced motion can interrupt an animation. */ }
    finally { transition.skipTransition(); await transition.finished.catch(()=>{}); animation?.cancel(); cleanup(); }
  }
  // Arriving at the homepage: show it only when complete, then let the CSS cross-fade finish the transition.
  async function arrive(transition, ready) {
    try {
      await transition.ready;
      await Promise.race([ready, transition.finished]);
      html.setAttribute('data-home-arrival','ready');
      await transition.finished;
    } catch { /* Another navigation or a skipped transition ends the hold early. */ }
    finally { cleanup(); }
  }
  // Astro keeps the old document visible while loading the next page and its artwork.
  // Never hide the old page or animate the incoming page over an empty body.
  document.addEventListener('astro:before-preparation', event => {
    if (connected(event.from?.href,event.to?.href)) {
      const load=event.loader;
      event.loader=async()=>{
        const destination=await window.xrSuitsPrepare?.(event.to,event.signal);
        if(event.signal?.aborted)return;
        if(destination)event.to=destination.to;
        await load();
        if(event.signal?.aborted||event.defaultPrevented)return;
        const source=event.newDocument.querySelector('.st-bg__astronaut')?.getAttribute('src');
        if(source) { const image=new Image();image.src=new URL(source,event.to).href;await image.decode().catch(()=>{}); }
      };
    }
    if (scene(event.to?.href)) {
      const load=event.loader;
      event.loader=async()=>{
        await load();
        const next=event.newDocument;
        if(event.signal?.aborted||event.defaultPrevented||!next?.querySelector('[data-home-waves]'))return;
        // Start the homepage's scripts, opening photo, and fonts while this page is still shown.
        for (const script of next.querySelectorAll('script[type="module"][src]')) {
          const link=document.createElement('link');link.rel='modulepreload';link.href=new URL(script.getAttribute('src'),event.to).href;document.head.append(link);
        }
        const warm=[document.fonts?.load('1em Outfit'),document.fonts?.load('600 1em "Labs Display"')];
        const photo=next.querySelector('[data-gallery-photo] img');
        if(photo) {
          const image=new Image();image.sizes=photo.getAttribute('sizes')??'';image.srcset=photo.getAttribute('srcset')??'';
          image.src=new URL(photo.getAttribute('src'),event.to).href;warm.push(image.decode());
        }
        await Promise.race([Promise.allSettled(warm),new Promise(resolve=>setTimeout(resolve,6000))]);
      };
    }
  });
  document.addEventListener('astro:before-swap', event => {
    const mark=name=>{html.setAttribute(name,'');event.newDocument.documentElement.setAttribute(name,'');};
    // Pages that build themselves before showing: the dashboard, and the funding page's background.
    const builds='#st[data-mode="workspace"], [data-arrival-hold]';
    if(event.newDocument.querySelector?.(builds)){
      if(!document.startViewTransition||document.querySelector(builds)){event.viewTransition.skipTransition();cleanup();return;}
      // Entering such a page from another keeps that page on screen while the new one is built underneath;
      // xrSuitsReveal then reveals the finished page, so no loading state shows. A gate ends the hold early.
      const ready=new Promise(resolve=>{const timer=setTimeout(resolve,8000);held=()=>{clearTimeout(timer);resolve();};});
      const release=held;
      mark('data-home-arrival');
      if(reduced())active=arrive(event.viewTransition,ready);
      else{mark('data-suits-navigation');active=animate(event.viewTransition,ready);}
      void active.finally(()=>{if(held===release)held=undefined;});
      return;
    }
    if (!document.startViewTransition) return;
    // Listen for the arriving page only after the swap, so this page's own events are ignored.
    const arriving=scene(event.to?.href)&&!!event.newDocument.querySelector?.('[data-home-waves]');
    const ready=arriving?new Promise(resolve=>document.addEventListener('astro:after-swap',()=>resolve(arrival()),{once:true})):undefined;
    if (connected(event.from?.href,event.to?.href) && !reduced()) {
      mark('data-suits-navigation');
      if(arriving)mark('data-home-arrival');
      active=animate(event.viewTransition,ready);
    } else if (arriving) {
      mark('data-home-arrival');
      active=arrive(event.viewTransition,ready);
    }
  });
  window.xrSuitsReveal=async update=>{
    // A held entry still shows the previous page: draw the dashboard beneath it, then let that transition reveal it.
    if(held){
      const release=held;held=undefined;
      try{await update();}finally{release();}
      await active;return;
    }
    await active;
    if(reduced() || !document.startViewTransition) { await update(); return; }
    html.setAttribute('data-suits-navigation','');
    const transition=document.startViewTransition(update);
    active=animate(transition);
    await active;
  };
  // A sign-in or approval gate shown instead of the dashboard reveals the page as it is.
  window.xrSuitsRelease=()=>{const release=held;held=undefined;release?.();};
  window.xrSuitsHeld=()=>!!held;
  // Native snapshots also cover direct same-origin navigations such as auth callbacks.
  window.addEventListener('pageswap', event=>{
    const transition=event.viewTransition;if(!transition)return;
    const to=event.activation?.entry?.url;
    // The arriving homepage keeps this page's snapshot until it is ready.
    if(!reduced() && !connected(location.href,to) && scene(to) && documentHold())return;
    if(reduced() || !connected(location.href,to)){transition.skipTransition();return;}
    html.setAttribute('data-suits-navigation','');transition.finished.finally(cleanup);
  });
  window.addEventListener('pagereveal',event=>{
    const transition=event.viewTransition;if(!transition)return;
    if(document.querySelector('#st[data-mode="workspace"]')){transition.skipTransition();cleanup();return;}
    const from=window.navigation?.activation?.from?.url;
    const arriving=html.hasAttribute('data-home-loading');
    if(!reduced() && connected(from,location.href)){
      const hold=arriving&&documentHold();
      html.setAttribute('data-suits-navigation','');if(hold)html.setAttribute('data-home-arrival','');
      active=animate(transition,hold?arrival():undefined);return;
    }
    if(arriving && documentHold()){html.setAttribute('data-home-arrival','');active=arrive(transition,arrival());return;}
    transition.skipTransition();cleanup();
  });
})();
