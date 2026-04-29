export interface Station {
  slug: string;
  token: string;
  name: string;
  clue: string;
  hint: string;
}

export const STATIONS: Station[] = [
  {
    slug: 'app-dev',
    token: 'a1f3c9',
    name: 'App Dev',
    clue: 'Begin where every world begins. Lines of text, compiled into universes. Find the builders before the builds.',
    hint: 'A campus club where students ship apps from scratch.',
  },
  {
    slug: 'drone-club',
    token: 'b2e7d4',
    name: 'Drone Club',
    clue: 'Now lift your eyes. The next station sees the campus from a height no person can stand at. Rotors, not wings.',
    hint: 'Quadcopters and the people who fly them.',
  },
  {
    slug: 'athletics',
    token: 'c4a8f1',
    name: 'UMD Athletics',
    clue: 'Bring it back to the body. A team trains here. Heart rate, motion, performance, captured.',
    hint: 'Maryland sports meet motion capture.',
  },
  {
    slug: 'great-teachers',
    token: 'd6b2a9',
    name: 'Great Teachers',
    clue: 'A classroom without walls. The next station teaches in a way no chalkboard ever could.',
    hint: 'Educators reimagining instruction in immersive space.',
  },
  {
    slug: 'testugo',
    token: 'e8c5b3',
    name: 'TestuGo',
    clue: 'The campus itself becomes the map. Hidden across College Park, a turtle leads the way.',
    hint: 'Interactive Maryland tours and a scavenger hunt of its own.',
  },
  {
    slug: 'augmented-worlds',
    token: 'f1d7e6',
    name: 'Augmented Worlds',
    clue: 'Reality, but with a layer on top. Phones become windows. Find the team that paints them.',
    hint: 'The augmented in AR.',
  },
  {
    slug: 'tron',
    token: 'g3a4c8',
    name: 'Tron',
    clue: 'Inside the grid. A film recreated in a game engine, frame for frame. Step in.',
    hint: 'A 1982 cult classic, rebuilt in Unity.',
  },
  {
    slug: 'double-point',
    token: 'h5f2b7',
    name: 'Double Point',
    clue: 'Your hands become the controller. No buttons. No tracking pucks. Just intent.',
    hint: 'A hand input company turning everyday gestures into commands.',
  },
  {
    slug: 'sisu-vr',
    token: 'i7e9d2',
    name: 'Sisu VR',
    clue: 'Endurance, in Finnish. A studio that puts you somewhere you have to push through.',
    hint: 'A VR studio whose name means quiet resilience.',
  },
  {
    slug: 'tanit-xr',
    token: 'j2b6c1',
    name: 'Tanit XR',
    clue: 'Named for an old goddess. New medium. Find the team carrying ancient stories into headsets.',
    hint: 'XR storytelling rooted in older mythologies.',
  },
  {
    slug: 'paraverse',
    token: 'k4d8a5',
    name: 'Paraverse',
    clue: 'Beside our universe, a parallel one. Step over.',
    hint: 'A team building parallel virtual spaces.',
  },
  {
    slug: 'vusexr',
    token: 'l6c3f9',
    name: 'vuseXR',
    clue: 'A new way to see. Vision, fused. The next station bends what your eyes accept.',
    hint: 'XR vision and perception.',
  },
  {
    slug: 'virnect',
    token: 'm8a7b4',
    name: 'Virnect',
    clue: 'From Korea. Industry meets immersion. Factories, training, remote hands.',
    hint: 'A Korean XR company building tools for industry.',
  },
  {
    slug: 'niantic',
    token: 'n1f5e2',
    name: 'Niantic',
    clue: 'You have walked their world before. Pokemon in the park. AR at the planetary scale.',
    hint: 'The team behind Pokemon Go and global AR maps.',
  },
  {
    slug: 'immersive-installation',
    token: 'o3b9d7',
    name: 'Immersive Installation',
    clue: 'No headset. The room itself is the experience. Walk in and look up.',
    hint: 'A walk-in spatial installation.',
  },
  {
    slug: 'rosetta-engine',
    token: 'p5e1c6',
    name: 'Rosetta Engine',
    clue: 'The final station is the closest one to you. Closer than your hands. Closer than your eyes. Read the signal at the source.',
    hint: 'A brain computer interface project. The signal is you.',
  },
];

export const FIRST_CLUE = STATIONS[0].clue;
export const TOTAL_STATIONS = STATIONS.length;

export function stationByToken(token: string): { station: Station; index: number } | null {
  const i = STATIONS.findIndex((s) => s.token === token);
  if (i === -1) return null;
  return { station: STATIONS[i], index: i };
}
