import { phase } from '../projects/projectStoryMotion';
import { collagePhotoOrigin, collagePhotoPose } from './cloudPhotoMotion';
import { createPhotoWindow } from './cloudPhotoWindow';
import { collageLayout, type CollageBox } from './cloudPhotoLayout';

export function mountCloudPhotoStory(layer: HTMLElement) {
  const scenes = [...layer.querySelectorAll<HTMLElement>('[data-cloud-photo-story]')].map(scene => ({
    scene, collage: scene.querySelector<HTMLElement>('[data-cloud-collage]')!,
    content: scene.querySelector<HTMLElement>('.cloud-photo-story__content')!,
    folders: [...scene.querySelectorAll<HTMLElement>('[data-cloud-photo-folder]')],
    fronts: [...scene.querySelectorAll<HTMLElement>('[data-cloud-photo-front]')],
    images: [...scene.querySelectorAll<HTMLImageElement>('img')],
    windows: [...scene.querySelectorAll<HTMLElement>('[data-cloud-photo-folder]')].map(folder => createPhotoWindow(folder.dataset.photoContour!)),
    birds: [...scene.querySelectorAll<HTMLElement>('[data-story-bird]')],
    direction: scene.dataset.photoLayout === 'right' ? -1 : 1,
    boxes: [] as CollageBox[], origins: [] as { x: number; y: number }[], width: 0,
    lastPose: undefined as { progress: number; reduced: boolean; revision: number } | undefined,
  }));
  let layoutRevision = 0;
  const warmedScenes = new WeakSet<HTMLElement>();
  function warm(scene: typeof scenes[number] | undefined) {
    if (!scene || warmedScenes.has(scene.scene)) return;
    warmedScenes.add(scene.scene);
    scene.images.forEach(image => {
      // Request and decode while the chapter is still hidden behind the intro
      // or the preceding chapter, without changing its reveal or image variants.
      image.loading = 'eager';
      void image.decode().catch(() => undefined);
    });
  }
  const style = (element: HTMLElement, property: string, value: string) => {
    if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
  };
  function measure() {
    const compact = layer.clientWidth <= 640;
    const layerHeight = layer.clientHeight;
    const availableHeight = layerHeight - parseFloat(layer.style.getPropertyValue('--story-header-bottom') || '110') - parseFloat(layer.style.getPropertyValue('--story-footer-height') || '54') - 90;
    // Snapshot every chapter's geometry before any collage style writes.
    const measurements = scenes.map(scene => {
      const width = scene.collage.clientWidth;
      const ratios = scene.folders.map(folder => Number(folder.dataset.photoRatio));
      // Read the actual wrapped copy, including its title, lead and contact link.
      const copy = compact ? undefined : {
        x: scene.content.offsetLeft, y: scene.content.offsetTop - scene.collage.offsetTop,
        width: scene.content.offsetWidth, height: scene.content.offsetHeight,
      };
      return { scene, width, ratios, copy, sceneWidth: scene.scene.clientWidth };
    });
    layoutRevision++;
    measurements.forEach(({ scene, width, ratios, copy, sceneWidth }) => {
      const layout = collageLayout(ratios, width, compact, scene.scene.dataset.cloudPhotoStory, availableHeight, copy);
      scene.boxes = layout.boxes;
      scene.origins = layout.boxes.map(box => collagePhotoOrigin(box, layout.boxes, width, layerHeight));
      scene.width = sceneWidth;
      style(scene.collage, 'height', layout.height.toFixed(3) + 'px');
      scene.folders.forEach((folder, index) => {
        const box = layout.boxes[index];
        style(folder, 'left', box.x.toFixed(3) + 'px');
        style(folder, 'top', box.y.toFixed(3) + 'px');
        style(folder, 'width', box.width.toFixed(3) + 'px');
        style(folder, 'height', box.height.toFixed(3) + 'px');
        const path = scene.windows[index](box.width, box.height, 0, 1);
        style(scene.fronts[index], 'clip-path', `path('${path}')`);
      });
    });
    // Measurement starts during the sky intro, before the first photo reveal.
    if (!layer.hidden) warm(scenes[0]);
  }
  function update(id: string, progress: number, _width: number, reduced: boolean) {
    const sceneIndex = scenes.findIndex(scene => scene.scene.dataset.cloudPhotoStory === id);
    const scene = scenes[sceneIndex];
    if (!scene || !scene.boxes.length) return;
    if (!layer.hidden) {
      if (!reduced && progress > 0) {
        warm(scene);
        warm(scenes[sceneIndex + 1]);
      } else if (reduced && !warmedScenes.has(scenes[sceneIndex + 1]?.scene ?? scene.scene)) {
        // Reduced motion reports complete progress for every chapter. Only
        // warm ahead of the chapter actually crossing the reading viewport.
        const bounds = scene.scene.getBoundingClientRect();
        if (bounds.bottom > 0 && bounds.top < layer.clientHeight) {
          warm(scene);
          warm(scenes[sceneIndex + 1]);
        }
      }
    }
    // Keep loading checks above the cache: reduced-motion chapters can enter
    // the viewport while their photo progress remains clamped at one.
    const previous = scene.lastPose;
    if (previous?.progress === progress && previous.reduced === reduced && previous.revision === layoutRevision) return;
    scene.lastPose = { progress, reduced, revision: layoutRevision };
    scene.folders.forEach((folder, index) => {
      const card = collagePhotoPose(progress, index, reduced);
      const origin = scene.origins[index];
      const x = origin.x * card.remaining;
      const y = origin.y * card.remaining;
      style(folder, 'visibility', card.visible ? 'visible' : 'hidden');
      style(folder, 'transform', `translate3d(${x.toFixed(3)}px,${y.toFixed(3)}px,0) rotate(${scene.boxes[index].roll}deg)`);
    });
    scene.birds.forEach((bird, index) => {
      const travel = reduced ? .5 : phase(0, 1, progress);
      const lane = Math.max(0, scene.width - 108);
      const along = lane * (.08 + .80 * travel);
      const x = (scene.direction > 0 ? along : lane - along) + index * 32;
      const y = 8 + (index === 1 ? -6 : index === 2 ? 5 : 0) - 3 * Math.sin(travel * Math.PI);
      style(bird, 'transform', `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`);
    });
  }
  return { measure, update };
}
