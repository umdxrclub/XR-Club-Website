// Copy for the projects page: the teams taking members this semester, how project funding works (from the
// Fall 2026 kickoff), and the proposal path. Plain, direct wording; no hyphens or dashes in user-facing text.

export const proposal = {
  name: 'Propose a new project',
  tagline: 'Request funding for your own idea. $400 per project, or $600 or $1,000 with a strong plan. Hardware only.',
  cta: 'Start a proposal',
};

export const fundingRules = {
  can: ['Hardware that fits the club\'s direction: headsets, sensors, parts and components', 'Equipment that benefits the club as a whole'],
  cannot: ['Subscriptions and software', 'Online APIs and cloud services', 'PCs and other devices that store data (headsets are the exception)'],
  notes: [
    'Purchases under $50 are covered by the team. Purchases over $150 go through SGA funding, on SGA\'s timeline.',
    'No reimbursements. Every order goes through the Treasurer. Do not buy first.',
    'Hardware bought with SGA funds that is not a consumable is university property and stays in the lab after you graduate. Software you build is yours.',
    'Funds are released in stages tied to checkpoints every 2 to 3 weeks. Missing two checkpoints in a row can move the remaining funds to another team.',
    'If lab equipment is all you need, there is nothing to fund and the project is approved as an XR Club project. Submit it here anyway so the board knows.',
  ],
};

export const whatHappensNext = [
  'The board reviews every proposal and selects the strongest and most feasible ones.',
  'When SGA funding is released, selected teams are notified by email and Discord.',
  'Selected teams check in every 2 to 3 weeks and present at Mini Demo Day and Demo Day.',
];

export type Team = {
  slug: 'immersive-installations' | 'niantic-spatial' | 'spatial-reality-display';
  name: string;
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
    tagline: 'Projection mapping, body tracking and audio reactive installations people can step into.',
    summary: [
      'Immersive Installations builds interactive physical spaces with visuals, projections and set design. The team works with projection mapping, body tracking and audio reactivity to make art people can step into: an interactive light show, an audiovisual DJ set, artwork that leaves the screen.',
      'The team provides materials and resources for members to make their own pieces, organizes and finds events, and runs workshops. Projects range from TouchDesigner and live coding in P5Live to physical set building with Blender.',
      'The team has shown work at Maryland Day and at NextNOW Fest with the New Works Incubator, and is planning an independent showcase at NextNOW Fest in Fall 2027. Any level of TouchDesigner or coding experience is welcome.',
    ],
    details: [
      { label: 'Meets', value: 'Mondays, 4 to 5 pm, AVW 4176' },
      { label: 'Contact', value: 'xaelshan@terpmail.umd.edu (Discord: zephyrxael)' },
      { label: 'Tools', value: 'TouchDesigner, P5Live, Blender, projectors, sensors' },
      { label: 'Experience', value: 'Any level' },
    ],
    question: 'What would you like to make or help make? An installation idea, a show, or the part you want to learn.',
    tools: ['TouchDesigner', 'p5.js or P5Live', 'Blender', 'Unity or Unreal', 'Audio (Ableton, Max/MSP)', 'Projectors or hardware', 'None yet'],
    meeting: 'on Mondays from 4 to 5 pm in AVW 4176',
    posters: true,
  },
  {
    slug: 'niantic-spatial',
    name: 'Niantic Spatial',
    tagline: 'Location based AR for smartphones, built in Unity with the Niantic Spatial SDK.',
    summary: [
      'The Niantic Spatial team is building an AR experience for smartphones with the Niantic Spatial SDK. The SDK anchors digital content to a real location, so the place itself is part of the experience.',
      'The team is still choosing the idea. The goal is a useful experience that makes real use of location, and there is room to shape what it does and how people use it.',
      'The work is in Unity and C#: learning the SDK, prototyping interactions, and building toward the direction the team picks. Unity or C# experience is required.',
    ],
    details: [
      { label: 'Contact', value: 'Julian Bauer (jbauer16@umd.edu), Arindam Tripathi (aritrip@umd.edu)' },
      { label: 'Stack', value: 'Unity, C#, Niantic Spatial SDK' },
      { label: 'Devices', value: 'Smartphones, Quest 3' },
      { label: 'Experience', value: 'Unity or C# required' },
    ],
    people: ['Julian Bauer', 'Arindam Tripathi', 'Avelyne Tran', 'Dvij Raicha', 'Jason Chen', 'Jayden Jung'],
    question: 'Describe your Unity or C# experience: a project, a repository, or a class. If you have one, name a place you would anchor an AR experience to.',
    tools: ['Unity', 'C#', 'AR Foundation, ARKit or ARCore', 'Niantic Lightship or Spatial SDK', '3D art', 'Backend or networking'],
    meeting: 'weekly, at a time set with the team',
  },
  {
    slug: 'spatial-reality-display',
    name: 'Terrapin Terrarium',
    tagline: 'A living terrarium in glasses free 3D on the Sony Spatial Reality Display, with gesture control.',
    summary: [
      'The Sony Spatial Reality Display shows 3D without glasses. It tracks the viewer\'s eyes and renders the scene for their exact position, so objects appear to float in front of the screen. Neural Lab\'s AirTouch adds gesture control from a standard webcam.',
      'The team will build a living terrarium of Testudo inspired terrapins and other creatures. They react to being looked at, scatter or gather when you tap the glass, and can be picked up or fed with a gesture. Visitors scan a code and their phone becomes a feeder, so a group can play at once.',
      'It is built to draw a crowd at Demo Day and Maryland Day and to be a strong portfolio piece: Unity and C#, Sony\'s Unity plugin, AirTouch, Blender for the creatures, and a small web remote on the club\'s existing backend. The display, an RTX PC and the webcam are in the XR Lab. This is a new team; the board runs it until a lead emerges.',
    ],
    details: [
      { label: 'Contact', value: 'XR Club board (umd.xr.club@gmail.com)' },
      { label: 'Stack', value: 'Unity, C#, Spatial Reality Display SDK, AirTouch, Blender' },
      { label: 'Hardware', value: 'Sony Spatial Reality Display, RTX PC, webcam (in the lab)' },
      { label: 'Experience', value: 'Unity or 3D art for the core work; any level for sound, web and design' },
    ],
    roles: ['Unity developers (2 to 3)', '3D artist and animator', 'Interaction designer (gestures and eye contact)', 'Web developer (phone feeder)', 'Sound and lighting'],
    question: 'Which part do you want to own: the creatures, the interactions, the phone remote, or sound and light? Describe the closest thing you have made.',
    tools: ['Unity (C#)', 'Blender or 3D animation', 'Shaders or VFX', 'Web (JavaScript)', 'Interaction or UX design', 'Sound design', 'None yet'],
    meeting: 'weekly, at a time set with the team',
  },
];

export const years = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Other'];
export const availabilityOptions = [
  { value: 'yes', label: 'Yes' },
  { value: 'most', label: 'Most weeks' },
  { value: 'unsure', label: 'Not sure yet' },
];
