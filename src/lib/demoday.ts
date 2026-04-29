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
    clue: 'Find the people building apps from scratch.',
    hint: 'A campus club. Ships apps every semester.',
  },
  {
    slug: 'drone-club',
    token: 'b2e7d4',
    name: 'Drone Club',
    clue: 'Look up. Whoever flies is next.',
    hint: 'They build, fly, and race quadcopters.',
  },
  {
    slug: 'athletics',
    token: 'c4a8f1',
    name: 'UMD Athletics',
    clue: 'Maryland sports, but in motion capture.',
    hint: 'Athletes, sensors, performance data.',
  },
  {
    slug: 'great-teachers',
    token: 'd6b2a9',
    name: 'Great Teachers',
    clue: 'A classroom that is not quite a classroom.',
    hint: 'Educators rethinking how a lesson works in XR.',
  },
  {
    slug: 'testugo',
    token: 'e8c5b3',
    name: 'TestuGo',
    clue: 'Testudo, on your phone. Find the campus tour.',
    hint: 'Interactive UMD map. Has its own scavenger hunt.',
  },
  {
    slug: 'augmented-worlds',
    token: 'f1d7e6',
    name: 'Augmented Worlds',
    clue: 'Phones become windows here.',
    hint: 'AR overlays on the real world.',
  },
  {
    slug: 'tron',
    token: 'g3a4c8',
    name: 'Tron',
    clue: 'The 1982 movie, rebuilt in Unity.',
    hint: 'A cult classic, recreated frame for frame.',
  },
  {
    slug: 'double-point',
    token: 'h5f2b7',
    name: 'Double Point',
    clue: 'Use your hands. No controllers.',
    hint: 'Hand input from a watch on your wrist.',
  },
  {
    slug: 'sisu-vr',
    token: 'i7e9d2',
    name: 'Sisu VR',
    clue: 'A studio named for the Finnish word for grit.',
    hint: 'VR experiences. Quietly ambitious.',
  },
  {
    slug: 'tanit-xr',
    token: 'j2b6c1',
    name: 'Tanit XR',
    clue: 'Old myths, new headsets.',
    hint: 'Storytelling rooted in older traditions.',
  },
  {
    slug: 'paraverse',
    token: 'k4d8a5',
    name: 'Paraverse',
    clue: 'A second universe, right next to ours.',
    hint: 'Parallel virtual worlds.',
  },
  {
    slug: 'vusexr',
    token: 'l6c3f9',
    name: 'vuseXR',
    clue: 'Vision plus XR. Step over there.',
    hint: 'Perception and vision in XR.',
  },
  {
    slug: 'virnect',
    token: 'm8a7b4',
    name: 'Virnect',
    clue: 'From Korea. Factories, training, remote help.',
    hint: 'Industrial XR for field workers.',
  },
  {
    slug: 'niantic',
    token: 'n1f5e2',
    name: 'Niantic',
    clue: 'You have played their game in your backyard.',
    hint: 'Pokemon Go. Location based AR at planet scale.',
  },
  {
    slug: 'immersive-installation',
    token: 'o3b9d7',
    name: 'Immersive Installation',
    clue: 'No headset. The room is the experience.',
    hint: 'Walk in. Look around.',
  },
  {
    slug: 'rosetta-engine',
    token: 'p5e1c6',
    name: 'Rosetta Engine',
    clue: 'Closer than your hands. Closer than your eyes.',
    hint: 'A brain computer interface. The signal is you.',
  },
];

export const FIRST_CLUE = STATIONS[0].clue;
export const TOTAL_STATIONS = STATIONS.length;

export function stationByToken(token: string): { station: Station; index: number } | null {
  const i = STATIONS.findIndex((s) => s.token === token);
  if (i === -1) return null;
  return { station: STATIONS[i], index: i };
}
