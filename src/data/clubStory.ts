export type ClubStoryBeat = {
  id: string;
  title: readonly string[];
  lead?: string;
  description?: string;
  layout: 'left' | 'right' | 'wide';
  tone: 'pearl' | 'light';
};

export const clubStory: readonly ClubStoryBeat[] = [
  {
    id: 'about',
    title: ['Build without', 'limits.'],
    description: "XR Club is where students come together to explore, create, and push what's possible with rapidly evolving technology.",
    layout: 'left',
    tone: 'pearl',
  },
  {
    id: 'community',
    title: ['Community'],
    description: 'All experience levels and years are welcome. We don’t choose people based on what they can do for the club. We look for people who are curious and willing to learn, and help them reach their goals.',
    layout: 'right',
    tone: 'light',
  },
  {
    id: 'history',
    title: ['History'],
    lead: "We've been here a while. Since 2015.",
    description: 'XR has deep roots at UMD. Our club was founded by Galen Stetsyuk in 2015, a year after UMD alum and Oculus co-founder Brendan Iribe donated $31 million to support computer science and immersive technology at Maryland.',
    layout: 'left',
    tone: 'pearl',
  },
  {
    id: 'sponsors',
    title: ['Sponsors', '& Partners'],
    lead: 'Build something with us.',
    description: 'We collaborate with companies, nonprofits, and organizations across UMD. Partner on a project, host a workshop, or sponsor the tools and experiences that help students build.',
    layout: 'right',
    tone: 'pearl',
  },
];

export const clubRecognition = [
  'Immersive Technology Leadership Award',
  'MIT Reality Hack Winners',
  'NASA SUITS Challenge Finalists',
  'NASA intern',
  'SWE at Amazon',
] as const;
