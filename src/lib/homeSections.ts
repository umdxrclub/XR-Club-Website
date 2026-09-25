import { SKY_PROJECT_HOLD, SKY_TRANSITION_DISTANCE } from '../features/sky/skyTimeline';
import { SKY_INTRO_DISTANCE, SKY_STORY_DISTANCE } from '../features/sky/skyStoryMotion';
import { EQUIPMENT_CAROUSEL_START } from '../features/equipment/equipmentMotion';

export type HomeSection = 'home' | 'about' | 'projects' | 'equipment';
export function isHomeSection(value: string): value is HomeSection {
  return ['home', 'about', 'projects', 'equipment'].includes(value);
}

// Use the story's own distances so navigation follows changes to its chapters.
export function homeSectionStops(reduced: boolean) {
  const projects = reduced ? .9 : 1.8;
  const sky = projects + (reduced ? .2 : SKY_PROJECT_HOLD) + (reduced ? .7 : SKY_TRANSITION_DISTANCE);
  return {
    home: 0,
    projects,
    about: sky + SKY_INTRO_DISTANCE * .62,
    equipment: sky + SKY_STORY_DISTANCE + EQUIPMENT_CAROUSEL_START,
    sky,
    equipmentStart: sky + SKY_STORY_DISTANCE,
  };
}

export function sectionAtTravel(travel: number, reduced: boolean): HomeSection {
  const stops = homeSectionStops(reduced);
  if (travel > stops.equipmentStart) return 'equipment';
  if (travel > stops.projects + (reduced ? .2 : SKY_PROJECT_HOLD)) return 'about';
  return travel >= stops.projects - .01 ? 'projects' : 'home';
}
