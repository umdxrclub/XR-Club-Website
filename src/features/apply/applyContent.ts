// Copy for the funding page: how project funding works this semester (from the Fall 2026 kickoff),
// and the teams taking applications.

export const fundingFacts = [
  { value: '$400', label: 'base funding per project' },
  { value: '$600 or $1,000', label: 'with a strong outline, MVP and timeline' },
  { value: '3 to 10', label: 'people per team' },
  { value: 'Hardware', label: 'is what funding buys' },
];

export const fundingRules = {
  can: ['Hardware that fits the club\'s direction: headsets, sensors, parts and components', 'Things that benefit the club as a whole'],
  cannot: ['Subscriptions or software', 'Online APIs or cloud services', 'PCs, or anything else that stores data (headsets excepted)'],
  notes: [
    'Under $50, your team covers it. Over $150 goes through SGA\'s funding process, with its timing.',
    'No reimbursements. Every order goes through the Treasurer; never buy first.',
    'Non-disposable hardware bought with SGA funds is university property and stays in the lab, even after you graduate. Software you build is yours to keep.',
    'Funds are released in stages, tied to project checks every 2 to 3 weeks. Miss two checks in a row and the remaining funds can go to another team.',
    'Only need lab equipment? Then there is nothing to fund: it is approved as an XR Club project. Pitch it here anyway so we know.',
  ],
};

export const whatHappensNext = [
  'The board reads every pitch and chooses the strongest and most feasible ones.',
  'Once SGA funding comes through, chosen teams hear from us by email and Discord.',
  'Chosen teams check in every 2 to 3 weeks and show their work at Mini Demo Day and Demo Day.',
];

export type Team = {
  slug: 'immersive-installations' | 'niantic-spatial' | 'spatial-reality-display';
  name: string;
  kicker: string;
  tagline: string;
  summary: string[];
  details: { label: string; value: string }[];
  people?: string[];
  roles?: string[];
  question: string;
  tools: string[];
  meeting: string;
  posters?: boolean;
};

export const teams: Team[] = [
  {
    slug: 'immersive-installations',
    name: 'Immersive Installations',
    kicker: 'Projections, interactive statues, exhibits',
    tagline: 'Art people can step into.',
    summary: [
      'Immersive Installations turns physical spaces into interactive experiences with visuals, projections and set design. The team explores how projection mapping, body tracking and audio-reactivity can build art people physically step into: an interactive light show, an audiovisual DJ set, artworks that step outside the digital.',
      'The team gathers resources and materials so members can create their own pieces, organizes and discovers events, and hosts workshops. Projects range from TouchDesigner and live coding (P5Live) to physical set making with Blender, connecting digital media with the environment.',
      'The team has shown work at Maryland Day and at NextNOW Fest with the New Works Incubator, and is already planning an independent showcase at NextNOW Fest in Fall 2027. Any amount of TouchDesigner or coding experience is welcome: you learn by making an installation together.',
    ],
    details: [
      { label: 'Meets', value: 'Mondays 4 to 5 pm, AVW 4176' },
      { label: 'Contact', value: 'xaelshan@terpmail.umd.edu · Discord zephyrxael' },
      { label: 'Tools', value: 'TouchDesigner, P5Live, Blender, projectors, sensors' },
      { label: 'Experience', value: 'Any level welcome' },
    ],
    question: 'What would you want to make, or help make? An installation idea, a show, or just the part you want to learn.',
    tools: ['TouchDesigner', 'p5.js or P5Live', 'Blender', 'Unity or Unreal', 'Audio (Ableton, Max/MSP)', 'Projectors or hardware', 'Nothing yet, here to learn'],
    meeting: 'Mondays 4 to 5 pm in AVW 4176',
    posters: true,
  },
  {
    slug: 'niantic-spatial',
    name: 'Niantic Spatial',
    kicker: 'XR Club × Niantic',
    tagline: 'AR that knows where it is.',
    summary: [
      'With Niantic Spatial, the team is exploring the Spatial SDK and building an AR experience for smartphones. These tools let digital content relate to a real location and stay connected to the space around it, so the place has a real purpose in the experience.',
      'The team is looking for a useful idea that makes good use of those capabilities rather than starting from a fixed concept. There is room to shape both what the experience does and how people use it in a physical space.',
      'The work is in Unity and C#: exploring the SDK, trying interactions, and developing a prototype around the direction the team chooses. Prior Unity or C# experience is needed so the team can focus on the spatial tools.',
    ],
    details: [
      { label: 'Contact', value: 'Julian Bauer (jbauer16@umd.edu) · Arindam Tripathi (aritrip@umd.edu)' },
      { label: 'Stack', value: 'Unity, C#, Niantic Spatial SDK' },
      { label: 'Devices', value: 'Smartphones, Quest 3' },
      { label: 'Experience', value: 'Unity or C# required' },
    ],
    people: ['Julian Bauer', 'Arindam Tripathi', 'Avelyne Tran', 'Dvij Raicha', 'Jason Chen', 'Jayden Jung'],
    question: 'Show us your Unity or C# experience: a project, a repo, or a class. If you have one, add a place you would love to anchor an AR experience to.',
    tools: ['Unity', 'C#', 'AR Foundation, ARKit or ARCore', 'Niantic Lightship or Spatial SDK', '3D art', 'Backend or networking'],
    meeting: 'weekly, at a time set with the team',
  },
  {
    slug: 'spatial-reality-display',
    name: 'Terrapin Terrarium',
    kicker: 'Sony Spatial Reality Display × Neural Lab',
    tagline: 'A hologram tank that knows you are there.',
    summary: [
      'Sony\'s Spatial Reality Display shows true 3D without glasses: it tracks your eyes and renders the scene for exactly where you are, so things float in front of the screen. Neural Lab\'s AirTouch turns a plain webcam into gesture control. Together they make a window you can look into and reach into.',
      'The team will build a living terrarium of Testudo-inspired terrapins and whatever else it dreams up. The creatures notice when you look at them and make eye contact, scatter or gather when you tap the glass, and can be picked up or fed with a gesture. Visitors scan a code and their phone becomes a feeder, so a crowd can play with the tank at once.',
      'It is built to pull a crowd at Demo Day and Maryland Day, and it is a real portfolio piece: Unity and C#, Sony\'s Unity plugin, AirTouch, Blender for the creatures, and a small web remote on the club\'s existing backend. The display, an RTX PC and the webcam live in the XR Lab. This is a new team; the board runs it until a lead emerges from the team.',
    ],
    details: [
      { label: 'Contact', value: 'XR Club board · umd.xr.club@gmail.com' },
      { label: 'Stack', value: 'Unity, C#, Spatial Reality Display SDK, AirTouch, Blender' },
      { label: 'Hardware', value: 'Sony Spatial Reality Display, RTX PC, webcam (in the lab)' },
      { label: 'Experience', value: 'Unity or 3D art for the core; any level for sound, web and design' },
    ],
    roles: ['Unity developers (2 to 3)', '3D artist and animator', 'Interaction designer (gestures, eye contact)', 'Web developer (phone feeder)', 'Sound and lighting'],
    question: 'Which part do you want to own: the creatures, the interactions, the phone remote, or sound and light? Tell us about the closest thing you have made.',
    tools: ['Unity (C#)', 'Blender or 3D animation', 'Shaders or VFX', 'Web (JavaScript)', 'Interaction or UX design', 'Sound design', 'Nothing yet, here to learn'],
    meeting: 'weekly, at a time set with the team',
  },
];

export const years = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Other'];
export const availabilityOptions = [
  { value: 'yes', label: 'Yes, I can make it' },
  { value: 'most', label: 'Most weeks' },
  { value: 'unsure', label: 'Not sure yet, still want in' },
];
