import projects from '../../data/projects.json';
import { siteLinks } from '../../config/site';

export const MAX_QUESTION_LENGTH = 600;
export type GuideLink = { label: string; href: string };
export type GuideReply = { text: string; links?: GuideLink[] };

const email = { label: 'Email XR Club', href: 'mailto:umd.xr.club@gmail.com' };
const discord = { label: 'Join the Discord', href: 'https://discord.gg/mn8ZKTwXFQ' };
const projectPage = { label: 'Projects on the club website', href: 'https://xr.umd.edu/projects' };
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const title = (name: string) => name.includes('Rosetta') ? 'The Rosetta Engine' : name.includes('Project ARIA') ? 'Project Aria' : name.includes(' - ') ? name.split(' - ').slice(1).join(' - ') : name;
const commonWords = new Set(['the', 'and', 'with', 'club', 'project', 'projects', 'xr', 'umd', 'your', 'own', 'build', 'reality', 'world', 'technology', 'app', 'dev', 'initiative', 'great', 'game', 'day']);

function findProject(question: string) {
  const words = new Set(question.split(' '));
  const ranked = projects.map(project => {
    const name = normalize(project.name), shortName = normalize(title(project.name));
    const tokens = [...new Set(name.split(' '))].filter(word => word.length > 2 && !commonWords.has(word));
    const exact = question.includes(name) || question.includes(shortName);
    return { project, score: exact ? 100 : tokens.filter(word => words.has(word)).length };
  }).sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 && ranked[0].score !== ranked[1]?.score ? ranked[0].project : undefined;
}

export function answerClubQuestion(input: string): GuideReply {
  const question = normalize(input.slice(0, MAX_QUESTION_LENGTH));
  const project = findProject(question);
  if (project) {
    const name = title(project.name);
    const contacts: GuideLink[] = project.contact_email ? [{
      label: 'Email the project contact',
      href: `mailto:${project.contact_email.split(/[,;]\s*/).map(address => address.trim()).join(',')}`,
    }] : [email];
    const links = project.website ? [...contacts, { label: 'Affiliate website', href: project.website }] : contacts;
    if (/\b(meeting|meetings|schedule|when|where|hours|location|deadline|deadlines|funding|budget)\b/.test(question)) {
      return { text: `Scheduling and funding details for ${name} aren't listed here. Ask the project contact for current information.`, links: contacts };
    }
    if (/\b(contact|email|lead|leads|leader|who|join|openings)\b/.test(question)) {
      return { text: project.contact_name ? `${name}: the listed contact is ${project.contact_name}. Ask them about the project and current opportunities.` : `${name} has no individual contact listed here. The club can help you find the right person.`, links: contacts };
    }
    if (/\b(equipment|hardware|device|devices|headset|headsets)\b/.test(question)) {
      return { text: project.equipment && project.equipment !== 'TBD' ? `${name} lists this equipment: ${project.equipment}.` : `${name} doesn't list confirmed equipment here. Ask the project contact for details.`, links: contacts };
    }
    if (/\b(experience|level|beginner|difficulty|skills)\b/.test(question)) {
      return { text: `${name} is listed at the ${project.tier} experience level. The project contact can explain the skills involved.`, links: contacts };
    }
    const summary = project.summary.split(/\n\s*\n/)[0].split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
    return { text: `${name}\n${summary}`, links };
  }
  if (/\b(meeting|meetings|schedule|when|where|hours|location|deadline|deadlines)\b/.test(question)) {
    return { text: "Meeting times, locations, and deadlines aren't listed in this guide. Ask the club for current details.", links: [discord, email] };
  }
  if (/\b(fund|funding|budget|grant|grants|money|propose|proposal|idea|ideate)\b/.test(question)) {
    return { text: 'XR Club lists equipment, funding, and space among its project support. Contact the club about your idea and current funding details.', links: [email] };
  }
  if (/\b(sponsor|sponsors|partner|partners)\b/.test(question)) {
    return { text: "The club's Sponsors & Partners page lists its supporting organizations.", links: [{ label: 'Sponsors & Partners', href: siteLinks.sponsors }, email] };
  }
  if (/\b(join|member|membership|involved|beginner|experience|skills)\b/.test(question)) {
    return { text: 'No prior experience is required to get involved. Explore the projects on this page, then ask the club or a listed project contact about current opportunities.', links: [discord, email] };
  }
  if (/\b(equipment|hardware|device|devices|headset|headsets)\b/.test(question)) {
    return { text: 'Equipment is listed per project in the Projects browser. Ask about a project by name to see its equipment, or contact the club about access and availability.', links: [email] };
  }
  if (/\b(project|projects|build|research)\b/.test(question)) {
    return { text: `This site includes ${projects.length} projects, including ${projects.slice(0, 5).map(project => title(project.name)).join(', ')}. Ask about one by name, or use Explore projects on this page to browse the full collection.`, links: [projectPage] };
  }
  if (/\b(contact|email|discord|help)\b/.test(question)) {
    return { text: 'Reach XR Club on Discord or at umd.xr.club@gmail.com.', links: [discord, email] };
  }
  if (/^(hi|hello|hey|thanks|thank you)$/.test(question)) {
    return { text: 'Ask about a project, equipment, funding, or getting involved with XR Club.' };
  }
  return { text: "I don't have that information in this guide. I can help with the projects shown here, or you can contact XR Club directly.", links: [email, discord] };
}
