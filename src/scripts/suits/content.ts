// Static facts from NASA's documents used across views: the dates, the
// proposal sections, and the checklist of required components.

export interface KeyDate {
  date: string;      // ISO date, local
  label: string;
  detail: string;
  approx?: boolean;  // month level only
}

export const KEY_DATES: KeyDate[] = [
  { date: '2026-09-24', label: 'Letter of intent due', detail: 'Emailed to nasa-suits@mail.nasa.gov with the subject "NASA SUITS Challenge Letter of Intent".' },
  { date: '2026-10-22', label: 'Proposal due', detail: 'The team lead submits one electronic copy through NASA STEM Gateway.' },
  { date: '2026-12-10', label: 'Orientation, 4 p.m. CST', detail: 'Required for every participant.' },
  { date: '2027-04-01', label: 'Virtual Software Design Review', detail: 'Required for every participant. First person video of the UI and the code are submitted with it.' },
  { date: '2027-05-01', label: 'Test week in Houston', detail: 'Onsite testing at NASA Johnson Space Center.', approx: true },
  { date: '2027-06-01', label: 'Draft white paper due', detail: 'A paper on the development of the display system when the challenge ends.', approx: true },
];

export interface ProposalSection {
  key: string;
  name: string;
  group: 'Before submission' | 'Technical' | 'Engagement' | 'Administrative' | 'Submission';
}

export const SECTIONS: ProposalSection[] = [
  { key: 'setup', name: 'Setup and letters', group: 'Before submission' },
  { key: 'abstract', name: 'Abstract', group: 'Technical' },
  { key: 'design', name: 'Software and hardware design description', group: 'Technical' },
  { key: 'conops', name: 'Concept of operations', group: 'Technical' },
  { key: 'ai', name: 'Artificial intelligence and machine learning', group: 'Technical' },
  { key: 'hitl', name: 'Human in the loop testing', group: 'Technical' },
  { key: 'pm', name: 'Project management', group: 'Technical' },
  { key: 'references', name: 'Technical references', group: 'Technical' },
  { key: 'community', name: 'Community engagement', group: 'Engagement' },
  { key: 'industry', name: 'Industry engagement', group: 'Engagement' },
  { key: 'admin', name: 'Administrative section', group: 'Administrative' },
  { key: 'budget', name: 'Funding and budget', group: 'Administrative' },
  { key: 'general', name: 'General', group: 'Submission' },
];

/** Tasks belong to a group: everyone, or one of the six roles. */
export const GROUPS: Array<{ key: string; name: string }> = [
  { key: 'team', name: 'Everyone' },
  { key: 'technical', name: 'Technical Design and Systems' },
  { key: 'uiux', name: 'UI/UX Design' },
  { key: 'aiml', name: 'AI/ML' },
  { key: 'hitl', name: 'HITL / Human Factors' },
  { key: 'pm', name: 'Project Management' },
  { key: 'engagement', name: 'Community and Industry Engagement' },
];

export function sectionName(key: string) {
  return GROUPS.find(g => g.key === key)?.name ?? SECTIONS.find(s => s.key === key)?.name ?? key;
}

export interface ChecklistItem {
  key: string;
  group: string;
  title: string;
  text: string;
}

export const CHECKLIST: ChecklistItem[] = [
  { key: 'loi', group: 'Before submission', title: 'Letter of intent sent', text: 'Email to nasa-suits@mail.nasa.gov by Thursday, September 24, 2026.' },
  { key: 'advisor', group: 'Before submission', title: 'Faculty advisor confirmed', text: 'Someone 21 or older who will supervise the team and travel to Houston.' },
  { key: 'gateway_profiles', group: 'Before submission', title: 'Everyone has a NASA STEM Gateway profile', text: 'Every team member and the faculty advisor.' },
  { key: 'gateway_invites', group: 'Before submission', title: 'Team lead sent Gateway invites', text: 'Only the lead completes the Gateway application; the rest accept invites.' },
  { key: 'roles', group: 'Before submission', title: 'Proposal roles assigned', text: 'Against the counts on the kickoff slide.' },

  { key: 'title_page', group: 'Title page', title: 'Title page complete', text: 'Team name, institution and address, team contact, all members with role, email, year and major, faculty advisor with signature and date.' },

  { key: 'abstract', group: 'Technical section', title: 'Abstract', text: 'Up to 500 words covering the design, the EVA scenario, planned testing, and any hardware we bring.' },
  { key: 'design', group: 'Technical section', title: 'Software and hardware design description', text: 'Architecture plan, hardware concepts, network diagrams, wireframes for navigation, telemetry, geology, EVA tasks and payloads, peripheral mock ups.' },
  { key: 'conops', group: 'Technical section', title: 'Concept of operations', text: 'From the astronaut\'s point of view through the whole EVA, ideally with a flowchart.' },
  { key: 'ai', group: 'Technical section', title: 'AI and ML section', text: 'Its own section. Models named and justified, predictive resource analysis, hallucination guardrails.' },
  { key: 'hitl', group: 'Technical section', title: 'HITL test plan', text: 'Schedule with dates, protocol, metrics, subject pools, demographics, safety, and how it builds to a full EVA test.' },
  { key: 'pm', group: 'Technical section', title: 'Project management plan', text: 'Gantt chart or similar, milestones, how progress is tracked.' },
  { key: 'references', group: 'Technical section', title: 'Technical references', text: 'Two or more, cited in text and listed in a recognized format.' },
  { key: 'page_limit', group: 'Technical section', title: 'Within 12 pages at 12 point', text: 'Figures and tables labeled and referenced. Extra images in an appendix.' },

  { key: 'community', group: 'Engagement section', title: 'Community engagement plan', text: 'At least two events with objectives, audience, dates, places, and what we will do there.' },
  { key: 'industry', group: 'Engagement section', title: 'Industry engagement plan', text: 'At least two engagements with named partners and a professional development strategy.' },
  { key: 'events_total', group: 'Engagement section', title: 'Four or more events in total', text: 'Any mix of community and industry engagements.' },
  { key: 'engagement_letters', group: 'Engagement section', title: 'Letters or agreements from host institutions', text: 'From groups that accept our invitation, for maximum points.' },

  { key: 'endorsement', group: 'Administrative section', title: 'Institutional letter of endorsement', text: 'On letterhead from the president, a dean, or a department chair.' },
  { key: 'faculty_statement', group: 'Administrative section', title: 'Statement of supervising faculty', text: 'On letterhead, signed, using NASA\'s wording.' },
  { key: 'original_work', group: 'Administrative section', title: 'Certification of original work', text: 'Signed by the team lead or faculty advisor, using NASA\'s wording.' },
  { key: 'rights_of_use', group: 'Administrative section', title: 'Statement of rights of use', text: 'Optional but favored. Signed by every member and the advisor.' },
  { key: 'budget', group: 'Administrative section', title: 'Funding and budget statement', text: 'Columnar budget and potential funding sources.' },
  { key: 'hololens', group: 'Administrative section', title: 'HoloLens 2 loan choice stated', text: 'Option A, B, or C.' },
  { key: 'logos', group: 'Administrative section', title: 'Logo files supplied', text: 'Horizontal and stacked versions as JPG or PNG.' },

  { key: 'submitted', group: 'Submission', title: 'Uploaded to NASA STEM Gateway', text: 'By Thursday, October 22, 2026. Aim for the day before.' },
];
