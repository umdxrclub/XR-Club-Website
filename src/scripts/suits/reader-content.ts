// The two NASA documents and, for each proposal role, the parts of each page
// written for that role. `from` and `to` are phrases on the page; the band runs
// from the line holding `from` (or the top of the page) to the line holding
// `to` (or the bottom of the page).
export type DocKey = 'guidelines' | 'mission';

export interface ReaderDoc {
  key: DocKey;
  title: string;
  short: string;
  file: string;
  pages: number;
}

export interface Highlight {
  doc: DocKey;
  page: number;
  label: string;
  from?: string;
  to?: string;
}

export interface ReaderRole {
  key: string;
  name: string;
  sections: Highlight[];
}

export const READER_DOCS: ReaderDoc[] = [
  { key: 'guidelines', title: 'NASA SUITS Proposal Guidelines 2026 to 2027', short: 'Proposal Guidelines', file: 'fy27-suits-proposal-guidelines (1).pdf', pages: 15 },
  { key: 'mission', title: 'NASA SUITS Mission Description 2026 to 2027', short: 'Mission Description', file: 'fy27-nasa-suits-mission-description.pdf', pages: 10 },
];

const g = (page: number, label: string, from?: string, to?: string): Highlight => ({ doc: 'guidelines', page, label, from, to });
const m = (page: number, label: string, from?: string, to?: string): Highlight => ({ doc: 'mission', page, label, from, to });

// Guidelines anchors
const DESIGN = 'b. Software and Hardware Design Description';
const CONOPS = 'c. Concept of Operations';
const AI = 'd. Artificial Intelligence';
const HITL = 'e. Human-in-the-loop';
const PM = 'f. Project Management';
const REFS = 'g. Technical References';
const ENGAGE = '6. Community and Industry Engagement Section';
const ADMIN = '7. Administrative Section';
const BUDGET = 'e. Funding and Budget Statement';
const LOAN = 'f. Hololens2 Loan Program';
const SCORING = 'g. Proposal Scoring Method';
const LOGO = 'i. Logo Use';

// Mission anchors
const CONCEPT = '2. Mission Concept';
const SUIT = '2a. Spacesuit';
const PREDICT = '2b. Predictive Analysis Tool';
const TASKS = '2c. Mission Tasks';
const EGRESS = 'Egress (Pre-Brief)';
const NAV = 'Navigation';
const POI = 'Points of Interest (POI) Tasks';
const SYSTEMS = '3. NASA Provided Systems and Equipment';
const REQS = '4. Requirements';
const PERIPH = '4b. Peripheral Requirements';

export const READER_ROLES: ReaderRole[] = [
  {
    key: 'technical',
    name: 'Technical Design and Systems',
    sections: [
      g(6, 'Design description', DESIGN, CONOPS),
      g(6, 'Concept of operations', CONOPS, AI),
      g(10, 'HoloLens 2 loan', LOAN, SCORING),
      g(12, 'How design is scored', 'DESIGN DESCRIPTION', 'CONCEPT OF OPERATIONS'),
      g(12, 'How CONOPS is scored', 'CONCEPT OF OPERATIONS', 'FEASIBILITY'),
      g(12, 'How feasibility is scored', 'FEASIBILITY'),
      m(4, 'Mission concept', CONCEPT, PREDICT),
      m(5, 'Mission tasks', TASKS),
      m(6, 'Navigation and POI tasks'),
      m(7, 'Ingress', undefined, SYSTEMS),
      m(7, 'TSS and UIA', SYSTEMS),
      m(8, 'Spectrometer, DCU, camera', undefined, REQS),
      m(8, 'Requirements', REQS),
      m(9, 'Display requirements', undefined, PERIPH),
      m(9, 'Peripheral requirements', PERIPH),
      m(10, 'Sample UIA procedures'),
    ],
  },
  {
    key: 'uiux',
    name: 'UI/UX Design',
    sections: [
      g(6, 'Design description: UI ideas and wireframes', DESIGN, CONOPS),
      g(6, 'Concept of operations', CONOPS, AI),
      g(12, 'How design is scored', 'DESIGN DESCRIPTION', 'CONCEPT OF OPERATIONS'),
      g(12, 'How CONOPS is scored', 'CONCEPT OF OPERATIONS', 'FEASIBILITY'),
      m(4, 'Mission concept and the spacesuit display', CONCEPT, PREDICT),
      m(4, 'Voice assistant wording', 'If using a voice assistant'),
      m(5, 'Mission tasks', TASKS),
      m(6, 'Navigation and POI tasks'),
      m(7, 'Ingress and breadcrumbs', undefined, SYSTEMS),
      m(8, 'Data the UI shows', undefined, REQS),
      m(9, 'Display requirements', undefined, PERIPH),
      m(10, 'Procedures the UI must walk through'),
    ],
  },
  {
    key: 'aiml',
    name: 'AI/ML',
    sections: [
      g(6, 'Artificial intelligence and machine learning', AI, HITL),
      g(13, 'How AI integration is scored', 'ARTIFICIAL INTELLIGENCE INTEGRATION', 'EFFECTIVENESS OF THE PROPOSED'),
      m(4, 'Predictive analysis tool', PREDICT),
      m(5, 'Egress: where AI fits', 'Teams will decide the most effective method', NAV),
      m(5, 'Navigation', NAV),
      m(6, 'Navigation solution', undefined, POI),
      m(7, 'Shortest safe path back', undefined, SYSTEMS),
      m(9, 'Voice assistance and predictive range', undefined, PERIPH),
    ],
  },
  {
    key: 'hitl',
    name: 'HITL / Human Factors',
    sections: [
      g(6, 'Human in the loop testing', HITL, PM),
      g(14, 'How the HITL plan is scored', 'HUMAN-IN-THE-LOOP', 'TECHNICAL REFERENCES'),
      m(4, 'Low light testing conditions', CONCEPT, SUIT),
      m(5, 'The EVA to simulate', TASKS),
      m(6, 'POI tasks to rehearse'),
      m(7, 'Ingress', undefined, SYSTEMS),
      m(9, 'Peripheral safety requirements', PERIPH),
      m(10, 'Egress procedures for test runs'),
    ],
  },
  {
    key: 'pm',
    name: 'Project Management',
    sections: [
      g(2, 'Title page'),
      g(4, 'Eligibility', '2. Eligibility'),
      g(5, 'Letter of intent', '3. Letter of Intent', '4. Proposal Requirements'),
      g(5, 'Proposal requirements', '4. Proposal Requirements', '5. Technical Section'),
      g(5, 'Abstract', 'a. Abstract'),
      g(6, 'Project management', PM),
      g(7, 'Project management, continued', undefined, REFS),
      g(7, 'Technical references', REFS, ENGAGE),
      g(10, 'Scoring and other deliverables', SCORING, LOGO),
      g(13, 'How the schedule is scored', 'EFFECTIVENESS OF THE PROPOSED'),
      g(14, 'How references are scored', 'TECHNICAL REFERENCES', 'Total Technical Scor'),
      m(3, 'Background'),
      m(4, 'Mission concept', CONCEPT, SUIT),
    ],
  },
  {
    key: 'engagement',
    name: 'Community and Industry Engagement',
    sections: [
      g(7, 'Community and industry engagement', ENGAGE),
      g(8, 'Industry engagement', undefined, ADMIN),
      g(8, 'Letters of endorsement and supervising faculty', ADMIN),
      g(9, 'Original work and rights of use'),
      g(10, 'Funding and budget', BUDGET, SCORING),
      g(10, 'Logo files', LOGO),
      g(15, 'How engagement is scored', 'COMMUNITY ENGAGEMENTS', 'Note: Check the NASA SUITS'),
      m(3, 'Background for outreach'),
    ],
  },
];
