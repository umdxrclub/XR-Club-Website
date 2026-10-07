import projects from '../../data/projects.json';

const fullProjectDescription = (name: string): string[] => {
  const project = projects.find(project => project.name === name);
  if (!project) throw new Error(`Missing project description: ${name}`);
  return project.summary.split(/\n\s*\n/);
};

export const fundingRules = {
  can: ['Hardware that fits the club\'s direction: headsets, sensors, parts and components', 'Equipment that benefits the club as a whole'],
  cannot: ['Subscriptions and software', 'Online APIs and cloud services', 'PCs and other devices that store data (headsets are the exception)'],
  notes: [
    'Purchases under $50 are covered by the team. Purchases over $150 go through SGA funding, on SGA\'s timeline.',
    'No reimbursements. Every order goes through the Treasurer. Do not buy first.',
    'Hardware bought with SGA funds that is not a consumable is university property and stays in the lab after you graduate. Software you build is yours.',
    'Funds are released in stages tied to checkpoints every 2 to 3 weeks. Missing two checkpoints in a row can move the remaining funds to another team.',
    'If lab equipment is all you need, you can work on an XR Club project without requesting funding.',
  ],
};

export type Team = {
  slug: 'immersive-installations' | 'niantic-spatial' | 'spatial-reality-display';
  name: string;
  tagline: string;
  summary: string[];
  fullDescription: string[];
  details: { label: string; value: string }[];
  question: string;
  tools: string[];
  meeting: string;
};

export const teams: Team[] = [
  {
    slug: 'immersive-installations', name: 'Immersive Installations',
    tagline: 'Projection mapping, body tracking and visuals that respond to sound.',
    summary: ['Create interactive installations using projection mapping, body tracking and sound. Work with the team on visuals, physical spaces and pieces people can interact with.'],
    fullDescription: fullProjectDescription('Immersive Installations'),
    details: [{ label: 'Tools', value: 'TouchDesigner, P5Live, Blender, projectors and sensors' }, { label: 'Experience', value: 'All experience levels welcome' }],
    question: 'What would you like to make or learn with this team?',
    tools: ['TouchDesigner', 'p5.js or P5Live', 'Blender', 'Unity or Unreal', 'Audio', 'Projectors or hardware'],
    meeting: 'Mondays, 4 to 5 pm in AVW 4176.',
  },
  {
    slug: 'niantic-spatial', name: 'Niantic Spatial',
    tagline: 'Location based AR for smartphones, built in Unity.',
    summary: ['Build an AR experience for smartphones in Unity with the Niantic Spatial SDK. Connect digital content to real places and help the team decide what to create.'],
    fullDescription: fullProjectDescription('Niantic - Niantic Spatial'),
    details: [{ label: 'Tools', value: 'Unity, C# and Niantic Spatial SDK' }, { label: 'Experience', value: 'Unity or C# experience required' }],
    question: 'What have you made with Unity or C#?',
    tools: ['Unity', 'C#', 'AR Foundation', 'Niantic Spatial SDK', '3D art', 'Backend or networking'],
    meeting: 'The team will agree on a weekly meeting time.',
  },
  {
    slug: 'spatial-reality-display', name: 'Sony Spatial Reality Display',
    tagline: 'Create a 3D experience on a display that needs no glasses.',
    summary: ['The Sony Spatial Reality Display shows 3D without glasses. Your team will choose what to build, from an interactive scene to a game or a new way to explore 3D content.'],
    fullDescription: [
      'The Sony Spatial Reality Display shows 3D without glasses. It tracks the viewer\'s eyes and renders the scene for their exact position, so objects appear to float in front of the screen. Neural Lab\'s AirTouch adds gesture control from a standard webcam.',
      'Your team will choose what to build, from an interactive scene to a game or a new way to explore 3D content.',
      'Work with Unity, C#, the Spatial Reality Display SDK and Blender. The display and development PC are in the XR Lab.',
    ],
    details: [{ label: 'Tools', value: 'Unity, C#, Spatial Reality Display SDK and Blender' }, { label: 'Equipment', value: 'Sony Spatial Reality Display and development PC in the XR Lab' }],
    question: 'What would you like to create, and what would you bring to the team?',
    tools: ['Unity', 'C#', 'Blender', 'Shaders or VFX', 'Interaction design', 'Sound design'],
    meeting: 'The team will agree on a weekly meeting time.',
  },
];

export const years = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Other'];
export const availabilityOptions = [
  { value: 'yes', label: 'Yes' },
  { value: 'most', label: 'Most weeks' },
  { value: 'unsure', label: 'Not sure yet' },
];
