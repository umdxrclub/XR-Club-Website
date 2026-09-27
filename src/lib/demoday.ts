export interface Station {
  slug: string;
  token: string;
  name: string;
  description: string;
}

export const STATIONS: Station[] = [
  { slug: 'info-booth',             token: 'q7c2a3', name: 'XR Club Info Booth',     description: 'The home base. Where you started.' },
  { slug: 'imdm',                   token: 'r9d4e5', name: 'IMDM',                   description: 'Immersive Media Design, the major behind Demo Day.' },
  { slug: 'app-dev',                token: 'a1f3c9', name: 'App Dev',                description: 'A campus club. Ships apps every semester.' },
  { slug: 'drone-club',             token: 'b2e7d4', name: 'Drone Club',             description: 'They build, fly, and race quadcopters.' },
  { slug: 'athletics',              token: 'c4a8f1', name: 'UMD Athletics',          description: 'Athletes, sensors, performance data.' },
  { slug: 'great-teachers',         token: 'd6b2a9', name: 'Great Teachers',         description: 'Educators rethinking how a lesson works in XR.' },
  { slug: 'testugo',                token: 'e8c5b3', name: 'TestuGo',                description: 'Interactive UMD map and campus scavenger hunt.' },
  { slug: 'augmented-worlds',       token: 'f1d7e6', name: 'Augmented Worlds',       description: 'AR overlays on the real world.' },
  { slug: 'tron',                   token: 'g3a4c8', name: 'Tron',                   description: 'The 1982 movie, rebuilt in Unity.' },
  { slug: 'double-point',           token: 'h5f2b7', name: 'Double Point',           description: 'Hand input from a watch on your wrist.' },
  { slug: 'sisu-vr',                token: 'i7e9d2', name: 'Sisu VR',                description: 'A studio named for the Finnish word for grit.' },
  { slug: 'tanit-xr',               token: 'j2b6c1', name: 'Tanit XR',               description: 'Old myths, new headsets.' },
  { slug: 'paraverse',              token: 'k4d8a5', name: 'Paraverse',              description: 'Parallel virtual worlds.' },
  { slug: 'vusexr',                 token: 'l6c3f9', name: 'vuseXR',                 description: 'Vision and perception in XR.' },
  { slug: 'virnect',                token: 'm8a7b4', name: 'Virnect',                description: 'Industrial XR for field workers, from Korea.' },
  { slug: 'niantic',                token: 'n1f5e2', name: 'Niantic',                description: 'Pokemon Go. Location-based AR at planet scale.' },
  { slug: 'immersive-installation', token: 'o3b9d7', name: 'Immersive Installation', description: 'No headset. The room is the experience.' },
  { slug: 'rosetta-engine',         token: 'p5e1c6', name: 'Rosetta Engine',         description: 'A brain computer interface. The signal is you.' },
];

export const TOTAL_STATIONS = STATIONS.length;

export function stationByToken(token: string): Station | null {
  return STATIONS.find((s) => s.token === token) ?? null;
}

export function stationBySlug(slug: string): Station | null {
  return STATIONS.find((s) => s.slug === slug) ?? null;
}
