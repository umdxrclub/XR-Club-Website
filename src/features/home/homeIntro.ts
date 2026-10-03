const shrink = 700, flipAt = 460, flip = 540;
const glide = 'cubic-bezier(.65, 0, .2, 1)';

type Box = { left: number; top: number; width: number; height: number };
// The header's logo (public/brand/xr-labs-header.svg) and HomeIntro's copy share this viewBox.
const logoView = { width: 1014, height: 266 };

/** Shrinks the loading paper into a folder on the opening photo's frame and flips it over into the photo, while the logo glides into the header. */
export function mountHomeIntro() {
  const root = document.documentElement;
  document.addEventListener('xr:home-visible', () => {
    const intro = document.querySelector<HTMLElement>('[data-home-intro]');
    if (!intro) return;
    if (!root.hasAttribute('data-home-intro-on')) { intro.remove(); return; }
    const card = intro.querySelector<HTMLElement>('[data-home-intro-card]')!;
    const back = intro.querySelector<HTMLElement>('[data-home-intro-back]')!;
    const logo = intro.querySelector<SVGSVGElement>('[data-home-intro-logo]')!;
    const gallery = document.querySelector<HTMLElement>('[data-home-gallery]');
    const carousel = document.querySelector<HTMLElement>('[data-home-carousel]');
    const photo = carousel?.querySelector('img');
    const brand = document.querySelector<HTMLImageElement>('.site-header__brand img');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let ended = false, unwatch = () => {};
    const restores: (() => void)[] = [];
    const finishes: Promise<unknown>[] = [];
    const done = () => {
      if (ended) return;
      ended = true; unwatch(); restores.forEach(restore => restore());
      document.dispatchEvent(new CustomEvent('xr:home-intro-done'));
    };
    const fade = (duration: number) => intro.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease', fill: 'forwards' }).finished.then(done, done);
    if (reduced) { fade(400); return; }
    // A page element stays out of sight while its stand-in travels, then comes back in the frame the stand-in leaves.
    const cover = (element: Element) => {
      const hidden = element.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' });
      restores.push(() => hidden.cancel());
    };
    const screen = intro.getBoundingClientRect();
    const frame = (box: Box) => ({ left: `${box.left - screen.left}px`, top: `${box.top - screen.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    const timing = { duration: shrink, easing: glide, fill: 'forwards' as const };
    const paperFrom = card.getBoundingClientRect();
    const to = carousel?.getBoundingClientRect();
    // Section addresses and early scrolling open away from the photo, so there is nothing for the folder to become there.
    const atOpening = !Number(document.querySelector<HTMLElement>('[data-home-waves]')?.dataset.storyTravel) && !gallery?.hasAttribute('data-flight');
    const onScreen = !!to && to.width > 0 && to.bottom > 0 && to.top < screen.height && to.right > 0 && to.left < screen.width;
    const toPhoto = !!(gallery && carousel && to && photo?.currentSrc && atOpening && onScreen);
    // Without a photo to become, the paper shrinks to a small folder in the middle of the screen and lets go.
    const smallHeight = Math.min(screen.height * .36, 300), smallWidth = smallHeight * 2 / 3;
    const paperTo: Box = toPhoto ? to! : { left: screen.left + (screen.width - smallWidth) / 2, top: screen.top + (screen.height - smallHeight) / 2, width: smallWidth, height: smallHeight };
    // The logo glides off the paper into the header's logo. It leaves the card first, because the card is changing size
    // underneath it; the header's own logo stays hidden until it lands.
    const spot = brand?.getBoundingClientRect();
    if (brand && spot && spot.width > 0 && spot.top < screen.height && getComputedStyle(brand).filter === 'none') {
      // The image centres its drawing inside its box, like the SVG's default preserveAspectRatio.
      const scale = Math.min(spot.width / logoView.width, spot.height / logoView.height);
      const width = logoView.width * scale, height = logoView.height * scale;
      const target: Box = { left: spot.left + (spot.width - width) / 2, top: spot.top + (spot.height - height) / 2, width, height };
      const start = logo.getBoundingClientRect();
      intro.append(logo);
      Object.assign(logo.style, frame(start), { position: 'absolute', translate: 'none', animation: 'none' });
      finishes.push(logo.animate([frame(start), frame(target)], timing).finished);
      // Its ink turns white exactly while it crosses the paper's top edge, so it reads dark on the paper and white over the
      // page. Every edge moves in a straight line through the eased progress, so each crossing is where a difference hits zero.
      const crossing = (atStart: number, atEnd: number) => atStart > 0 && atEnd < 0 ? atStart / (atStart - atEnd) : NaN;
      let enter = crossing(start.top - paperFrom.top, target.top - paperTo.top);
      let exit = crossing(start.bottom - paperFrom.top, target.top + target.height - paperTo.top);
      if (!(enter < exit)) { enter = .7; exit = 1; }
      const ink = (selector: string, property: 'fill' | 'stroke') =>
        logo.querySelector(selector)!.animate([{ [property]: '#24252a', offset: 0 }, { [property]: '#24252a', offset: enter }, { [property]: '#ffffff', offset: exit }, { [property]: '#ffffff', offset: 1 }], timing);
      ink('[data-badge]', 'fill');
      ink('[data-word]', 'stroke');
      cover(brand);
    }
    const from = frame(paperFrom);
    if (!toPhoto || !gallery || !carousel || !photo || !to) {
      card.animate([from, frame(paperTo)], timing);
      finishes.push(card.animate([{ opacity: 1 }, { opacity: 1, offset: .55 }, { opacity: 0 }], { duration: shrink, easing: 'ease-in', fill: 'forwards' }).finished);
      Promise.all(finishes).then(done, done);
      return;
    }
    // The photo already on the page rides on the folder's back, so the flip lands on identical pixels before the folder leaves.
    // The page's own photo stays covered meanwhile: the paper spans its frame the whole way down, and showing it
    // behind the turning card would double the picture.
    const copy = new Image();
    copy.src = photo.currentSrc; copy.alt = '';
    back.replaceChildren(copy);
    copy.decode().catch(() => undefined);
    cover(carousel);
    card.animate([from, frame(to)], timing);
    const turn = card.animate(
      [{ transform: 'perspective(1600px) rotateY(0deg)' }, { transform: 'perspective(1600px) rotateY(180deg)' }],
      { duration: flip, delay: flipAt, easing: 'cubic-bezier(.55, 0, .3, 1)', fill: 'both' });
    // Swap the faces exactly edge-on as well, where the card has no width, so no engine can show the wrong one.
    const faces = [...card.children] as HTMLElement[];
    faces.forEach((face, index) => face.animate(
      [{ opacity: 1 - index }, { opacity: 1 - index, offset: .5 }, { opacity: index, offset: .5 }, { opacity: index }],
      { duration: flip, delay: flipAt, fill: 'both' }));
    finishes.push(turn.finished);
    Promise.all(finishes).then(done, done);
    // Scrolling into the project story takes over the photo: give everything back at once and get the paper out of the way.
    const story = (event: Event) => {
      if (!(event as CustomEvent<boolean>).detail || ended) return;
      unwatch(); restores.forEach(restore => restore());
      fade(150);
    };
    gallery.addEventListener('xr:carousel-freeze', story);
    unwatch = () => gallery.removeEventListener('xr:carousel-freeze', story);
  });
}
