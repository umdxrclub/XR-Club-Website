import { phase } from '../projects/projectStoryMotion';
import { skyStoryPose, storyChapters, type BirdFocus, type SkyStoryPose } from './skyStoryMotion';
import { mountStoryChrome } from './skyStoryChrome';
import { CLOUD_PHOTO_HOLD } from './cloudPhotoMotion';
import { mountCloudPhotoStory } from './cloudPhotoStory';

export function mountSkyStory(root: HTMLElement) {
  const layer = root.querySelector<HTMLElement>('[data-sky-story]');
  if (!layer) return null;
  const photoStory = mountCloudPhotoStory(layer);
  const veil = layer.querySelector<SVGSVGElement>('[data-story-veil]')!;
  const paper = layer.querySelector<SVGGElement>('[data-story-paper]')!;
  const base = layer.querySelector<SVGRectElement>('[data-story-mask-base]')!;
  const aperture = layer.querySelector<SVGCircleElement>('[data-story-aperture]')!;
  const sheet = layer.querySelector<SVGPathElement>('[data-story-sheet]')!;
  const shadowFilter = layer.querySelector<SVGFilterElement>('[data-story-shadow-filter]')!;
  const shadow = layer.querySelector<SVGFEFloodElement>('[data-story-shadow]')!;
  const softShadow = layer.querySelector<SVGFEFloodElement>('[data-story-shadow-soft]')!;
  const intro = layer.querySelector<HTMLElement>('[data-story-intro]')!;
  const ideas = intro.querySelector<SVGSVGElement>('[data-story-ideas]')!;
  ideas.pauseAnimations();
  const events = new AbortController();
  let ideasVisible = false, ideasReduced = false, ideasRunning = false;
  function animateIdeas() {
    const run = ideasVisible && !ideasReduced && !document.hidden;
    if (run === ideasRunning) return;
    ideasRunning = run;
    if (run) ideas.unpauseAnimations(); else ideas.pauseAnimations();
  }
  document.addEventListener('visibilitychange', animateIdeas, { signal: events.signal });
  const introHeading = intro.querySelector<HTMLElement>('[data-story-heading]')!;
  const introWipes = [...introHeading.querySelectorAll<HTMLElement>('[data-title-wipe]')];
  const introDetails = [...intro.querySelectorAll<HTMLElement>('[data-story-intro-detail]')];
  const copy = layer.querySelector<HTMLElement>('[data-story-copy-window]')!;
  const track = layer.querySelector<HTMLElement>('[data-story-copy-track]')!;
  const chapters = storyChapters.map(chapter => {
    const element = layer.querySelector<HTMLElement>(`[data-story-chapter="${chapter.id}"]`)!;
    return { ...chapter, element, top: 0, height: 0,
      heading: element.querySelector<HTMLElement>('[data-story-heading]')!,
      headingTop: 0, headingHeight: 0,
      wipes: [...element.querySelectorAll<HTMLElement>('[data-title-wipe]')],
      details: [...element.querySelectorAll<HTMLElement>('[data-story-reveal]')],
    };
  });
  const contact = layer.querySelector<HTMLAnchorElement>('[data-story-contact]');
  const accessibleChapters = [...root.querySelectorAll<HTMLElement>('[data-story-accessible-chapter]')];
  const chapterVisibility = new Map<string, boolean>();
  let contactVisible = false, contactOffset = 0, contactHeight = 0;
  function enableChapter(id: string, active: boolean, showContact = false) {
    if (chapterVisibility.get(id) !== active) {
      chapterVisibility.set(id, active);
      const chapter = chapters.find(chapter => chapter.id === id)!.element;
      chapter.setAttribute('aria-hidden', String(!active));
      chapter.inert = !active;
      accessibleChapters.find(element => element.dataset.storyAccessibleChapter === id)?.toggleAttribute('hidden', active);
    }
    if (id === 'sponsors' && contact && contactVisible !== showContact) {
      contactVisible = showContact;
      contact.tabIndex = showContact ? 0 : -1;
      contact.style.pointerEvents = showContact ? 'auto' : 'none';
    }
  }
  const chrome = mountStoryChrome(root);
  const header = root.ownerDocument.querySelector<HTMLElement>('[data-header]');
  const headerBar = header?.querySelector<HTMLElement>('.site-header__bar');
  const footer = root.ownerDocument.querySelector<HTMLElement>('.site-footer');
  let viewport = '', footerHeight = 54, headerBottom = 110, introHeight = 0, travel = 0, disposed = false, fontsReady = false;
  root.ownerDocument.fonts.ready.then(() => {
    if (!disposed) { fontsReady = true; viewport = ''; }
  });
  const attr = (element: Element, key: string, value: string) => {
    if (element.getAttribute(key) !== value) element.setAttribute(key, value);
  };
  const style = (element: HTMLElement | SVGElement, key: string, value: string) => {
    if (element.style.getPropertyValue(key) !== value) element.style.setProperty(key, value);
  };
  function showTitle(lines: HTMLElement[]) {
    lines.forEach(line => {
      style(line, '--title-reveal', '1');
      if (!line.hasAttribute('data-complete')) line.setAttribute('data-complete', '');
    });
  }
  function update(progress: number, width: number, height: number, active: boolean, reduced: boolean, bird: BirdFocus): SkyStoryPose {
    const pose = skyStoryPose(progress, width, height, bird, reduced);
    const hidden = !active || progress <= 0;
    if (layer!.hidden !== hidden) layer!.hidden = hidden;
    chrome.update(!hidden && pose.intro < 1, width, height, pose.paperAt, false);
    if (hidden) {
      chapters.forEach(chapter => enableChapter(chapter.id, false));
      ideasVisible = false; animateIdeas();
      if (root.dataset.skyStory) delete root.dataset.skyStory;
      return pose;
    }
    const mode = pose.intro < 1 ? 'intro' : 'reading';
    if (root.dataset.skyStory !== mode) root.dataset.skyStory = mode;
    // The intro title sizes itself up to the porthole's left edge.
    style(layer!, '--story-focus-left', `${Math.round(bird.x - bird.radius)}px`);
    const nextViewport = `${width} ${height}`;
    if (viewport !== nextViewport) {
      viewport = nextViewport;
      headerBottom = (header?.getBoundingClientRect().bottom ?? 100) + 8;
      const gutter = Math.max(width * .055, (headerBar?.getBoundingClientRect().left ?? width * .07) + 16);
      footerHeight = footer?.getBoundingClientRect().height ?? 54;
      style(layer!, '--story-gutter', `${gutter.toFixed(2)}px`);
      style(layer!, '--story-header-bottom', `${headerBottom}px`);
      style(layer!, '--story-footer-height', `${footerHeight}px`);
      if (fontsReady) {
        const wordWidth = ideas.querySelector('text')!.getComputedTextLength();
        if (wordWidth > 0) {
          attr(ideas, 'viewBox', `0 0 ${wordWidth} 100`);
          style(ideas.parentElement!, 'width', `${wordWidth / 100}em`);
        }
      }
      photoStory?.measure();
      if (contact) {
        contactOffset = contact.getBoundingClientRect().top - chapters.find(chapter => chapter.id === 'sponsors')!.element.getBoundingClientRect().top;
        contactHeight = contact.offsetHeight;
      }
      const measurements = chapters.map(chapter => ({
        height: chapter.element.offsetHeight,
        headingTop: chapter.heading.offsetTop,
        headingHeight: chapter.heading.offsetHeight,
      }));
      introHeight = intro.offsetHeight;
      attr(veil, 'viewBox', `0 0 ${nextViewport}`);
      attr(shadowFilter, 'width', String(width + 128));
      attr(shadowFilter, 'height', String(height + 128));
      attr(base, 'width', String(width)); attr(base, 'height', String(height));
      attr(base.parentElement!, 'width', String(width)); attr(base.parentElement!, 'height', String(height));
      chapters.forEach((chapter, index) => {
        Object.assign(chapter, measurements[index]);
        const previous = chapters[index - 1];
        chapter.top = previous ? Math.max(chapter.at * height, previous.top + previous.height + height * .18) : headerBottom + 24;
        style(chapter.element, 'top', `${chapter.top.toFixed(2)}px`);
      });
      const last = chapters[chapters.length - 1];
      const endGutter = height <= 380 ? 4 : height <= 540 ? 8 : 24;
      travel = Math.max(last.top - headerBottom - endGutter, last.top + last.height - height + footerHeight + endGutter);
    }
    if (pose.intro < 1) {
      const introTop = Math.min(pose.introCopyTop, height - footerHeight - introHeight - 24);
      style(layer!, '--story-intro-copy-top', `${introTop.toFixed(2)}px`);
      style(veil, 'visibility', 'visible');
      // Reduced motion fades the paper as the aperture expands.
      style(paper, 'opacity', pose.veilOpacity.toFixed(4));
      attr(aperture, 'cx', pose.cx.toFixed(2)); attr(aperture, 'cy', pose.cy.toFixed(2)); attr(aperture, 'r', pose.radius.toFixed(2));
      attr(sheet, 'd', pose.sheetPath);
      const shadowStrength = phase(.02, .16, pose.intro) * (1 - phase(.84, 1, pose.intro));
      attr(shadow, 'flood-opacity', (.38 * shadowStrength).toFixed(4));
      attr(softShadow, 'flood-opacity', (.22 * shadowStrength).toFixed(4));
      style(intro, 'visibility', pose.introOpacity > .001 ? 'visible' : 'hidden');
      showTitle(introWipes);
      style(introHeading, 'opacity', reduced ? '1' : (1 - pose.letterExit).toFixed(4));
      // Copy is already present; only the scene's departure fades it out.
      introDetails.forEach(detail => {
        style(detail, 'opacity', reduced ? '1' : (1 - pose.letterExit).toFixed(4));
        style(detail, 'transform', 'none');
      });
      ideasVisible = pose.introOpacity > .01; ideasReduced = reduced; animateIdeas();
    } else {
      ideasVisible = false; animateIdeas();
      style(veil, 'visibility', 'hidden');
      style(intro, 'visibility', 'hidden');
    }
    style(copy, 'opacity', '1');
    // The sheet's aperture is the only circular mask. A second, smaller mask
    // clips the words inside the open sky and creates an unwanted inner rim.
    style(copy, 'visibility', pose.push > 0 || pose.intro >= 1 ? 'visible' : 'hidden');
    const photoHold = reduced ? 0 : height * CLOUD_PHOTO_HOLD;
    const readingTravel = pose.cloudProgress * (travel + photoHold * chapters.length);
    let scroll = readingTravel;
    const photoProgress = chapters.map((chapter, index) => {
      const anchor = Math.max(0, chapter.top - headerBottom - 24);
      const start = anchor + index * photoHold;
      scroll -= Math.max(0, Math.min(photoHold, readingTravel - start));
      const lead = 0;
      return reduced ? 1 : Math.min(1, Math.max(0, (readingTravel - start + lead) / (photoHold + lead)
        + (index === 0 ? phase(.94, 1, pose.intro) * .08 : 0)));
    });
    style(track, 'transform', `translate3d(0,${(-scroll).toFixed(3)}px,0)`);
    chapters.forEach((chapter, index) => {
      const y = chapter.top - scroll;
      // Titles and copy remain fully visible while the collage enters.
      photoStory?.update(chapter.id, photoProgress[index], width, reduced);
      const reading = pose.intro >= 1 && !root.hasAttribute('data-equipment');
      enableChapter(chapter.id, reading && y < height - footerHeight && y + chapter.height > headerBottom,
        reading && y + contactOffset >= headerBottom && y + contactOffset + contactHeight <= height - footerHeight);
      showTitle(chapter.wipes);
      chapter.details.forEach(detail => {
        style(detail, 'opacity', '1');
        style(detail, 'transform', 'none');
      });
    });
    return pose;
  }

  return { update, dispose() {
    chapters.forEach(chapter => enableChapter(chapter.id, false));
    layer.hidden = true; disposed = true; ideasVisible = false; animateIdeas(); events.abort(); chrome.dispose(); delete root.dataset.skyStory;
  } };
}
