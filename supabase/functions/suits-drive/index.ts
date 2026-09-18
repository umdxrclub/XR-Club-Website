// Google Drive bridge for the NASA SUITS team dashboard (/suits/team).
//
// A Google service account is shared on one team folder. The dashboard uses it
// to browse the folder, create Docs, Sheets, and Slides inside it, give every
// team member edit access the first time they open the dashboard, and read the
// proposal document to report its length and sections.
//
// Every request carries the caller's Supabase session. Actions:
//   status       what is set up, the folder, the proposal doc, and access
//   setFolder    save the team folder (managers), verifies the share
//   list         files in a folder (default: the team folder)
//   recent       files edited in the last seven days
//   create       new doc, sheet, slides, or folder inside the team folder
//   setProposal  mark a Doc as the proposal (managers)
//   proposal     read the proposal Doc: words, sections, abstract length
//
// Secrets:
//   SUITS_GOOGLE_SERVICE_ACCOUNT   the service account key file, as JSON
//
// Deploy: npx supabase functions deploy suits-drive --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEAM_EMAIL = /@(terpmail\.)?umd\.edu$/i;
const DRIVE = 'https://www.googleapis.com/drive/v3';
const DOCS = 'https://docs.googleapis.com/v1';
const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents';
const FILE_FIELDS = 'id,name,mimeType,modifiedTime,createdTime,webViewLink,iconLink,size,lastModifyingUser(displayName,emailAddress,photoLink),parents';

const MIME = {
  folder: 'application/vnd.google-apps.folder',
  doc: 'application/vnd.google-apps.document',
  sheet: 'application/vnd.google-apps.spreadsheet',
  slides: 'application/vnd.google-apps.presentation',
};

// The sections NASA requires, in the guidelines' order. Used to build the
// proposal skeleton and to check the live document.
const PROPOSAL_SECTIONS: Array<{ heading: string; level: 1 | 2; match: RegExp; note?: string }> = [
  { heading: 'Title Page', level: 1, match: /title page/i, note: 'All information on the title page must be complete. The faculty advisor must also sign off on the cover of the proposal.' },
  { heading: 'Technical Section', level: 1, match: /^technical section/i, note: 'The Technical section shall not exceed 12 pages. The report body must use 12 point font. Label and reference figures and tables within the text.' },
  { heading: 'Abstract', level: 2, match: /^abstract/i, note: 'A brief (up to 500 words) summary that touches upon the elements of the proposed prototype design and how they relate to the requirements and EVA scenario in the Mission Description. Include any planned testing of the design and any proposed hardware or peripheral devices your team would bring to onsite testing.' },
  { heading: 'Software and Hardware Design Description', level: 2, match: /design description/i, note: 'A detailed description of the proposed software and how you plan to tackle each aspect of the design challenge. Present goals along with the expected key components of the product (system architecture plan, hardware concepts, network diagrams). Clearly lay out how you will integrate AI into your work and into the user experience. Show conceptual UI design ideas for navigation, telemetry, geology, EVA task instructions, and scientific payloads.' },
  { heading: 'Concept of Operations (CONOPS)', level: 2, match: /concept of operations|conops/i, note: 'Describe the overall high level concept of how your design will meet the expectations and requirements, from the viewpoint of the astronaut. Address how the application will assist the design evaluator in each aspect of the EVA scenario during testing. A flowchart of how your design operates throughout the mission may be a useful visual depiction.' },
  { heading: 'Artificial Intelligence and Machine Learning', level: 2, match: /artificial intelligence|machine learning|\bAI\b/i, note: 'An in depth view of how you plan to implement AI as a force multiplier for the crew members. Clearly describe how you plan to use AI/ML for predictive resource analysis tools. Include which AI models you plan to use and how you plan to control for hallucinations in mission critical areas.' },
  { heading: 'Human in the Loop (HITL) Testing', level: 2, match: /human.in.the.loop|hitl/i, note: 'Any pilot, user experience, human in the loop, or human factors studies planned. A written HITL test plan should include a testing schedule with proposed dates and times, test protocol, possible metrics and measures, feasible subject pools, expected population and demographics of test subjects, and all planned safety measures.' },
  { heading: 'Project Management', level: 2, match: /project management/i, note: 'An outline of the development plans along with internal key milestones. Use a Gantt chart or similar chart. Describe how progress will be tracked to ensure that you meet the requirements of the EVA scenario ahead of Test Week. Expect the NASA team to hold you accountable to provided milestones.' },
  { heading: 'Technical References', level: 2, match: /references/i, note: 'Cite referenced works in text and in a References section using formatting appropriate for a technical paper.' },
  { heading: 'Community and Industry Engagement Section', level: 1, match: /community and industry|engagement section/i, note: 'At least two community and two industry engagements are planned, with the expectation of four or more total events. Focus on the outreach activities the team intends to hold.' },
  { heading: 'Administrative Section', level: 1, match: /^administrative section/i },
  { heading: 'Institutional Letter of Endorsement', level: 2, match: /letter of endorsement/i, note: 'On the endorsing institution letterhead, from the institution president, dean of college, or department chair.' },
  { heading: 'Statement of Supervising Faculty', level: 2, match: /supervising faculty/i, note: 'A statement of support from a faculty member indicating a willingness to supervise and work with the team during all stages of the activity, on institution letterhead with the faculty advisor signature.' },
  { heading: 'Certification of Original Work', level: 2, match: /original work/i, note: 'A statement of original work from the team lead or faculty advisor, on institution letterhead, with signature.' },
  { heading: 'Statement of Rights of Use', level: 2, match: /rights of use/i, note: 'Not required, but teams with a Statement of Rights of Use will receive greater consideration. All team members and faculty advisors must sign.' },
  { heading: 'Funding and Budget Statement', level: 2, match: /budget/i, note: 'A simple columnar layout showing expected expenditures such as materials, machining, operating, testing, and shipping. List potential sources for funding.' },
  { heading: 'HoloLens 2 Loan Program', level: 2, match: /hololens/i, note: 'Indicate your interest in a loaned device: A) We do not require a loaned device. B) We need a loaned device from NASA SUITS to participate. C) We have a device but would still like to be considered for a loan.' },
  { heading: 'Appendix', level: 1, match: /^appendix/i, note: 'Additional images. Appendices do not count against the 12 page limit.' },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ---------------------------------------------------------------------------
// Service account token (RS256 JWT, exchanged at Google's token endpoint)
// ---------------------------------------------------------------------------
interface ServiceAccount { client_email: string; private_key: string; token_uri?: string }

let cachedToken: { value: string; expires: number } | null = null;

function b64url(data: ArrayBuffer | string) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function accessToken(sa: ServiceAccount) {
  if (cachedToken && cachedToken.expires > Date.now() + 60000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${b64url(sig)}`;
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!r.ok) throw new Error(`Google did not accept the service account key (${r.status}). Check the key JSON.`);
  const data = await r.json();
  cachedToken = { value: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

// ---------------------------------------------------------------------------
// Google API helpers
// ---------------------------------------------------------------------------
class GoogleError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function gapi(token: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `Google returned ${r.status}`;
    throw new GoogleError(msg, r.status);
  }
  return data;
}

function parseFolderId(input: string) {
  const s = input.trim();
  const m = s.match(/folders\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || s.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

function kind(mimeType: string) {
  if (mimeType === MIME.folder) return 'folder';
  if (mimeType === MIME.doc) return 'doc';
  if (mimeType === MIME.sheet) return 'sheet';
  if (mimeType === MIME.slides) return 'slides';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/vnd.google-apps.form') return 'form';
  return 'file';
}

function shape(f: Record<string, unknown>) {
  const u = (f.lastModifyingUser || {}) as Record<string, string>;
  return {
    id: f.id, name: f.name, kind: kind(String(f.mimeType || '')), mimeType: f.mimeType,
    modifiedTime: f.modifiedTime, createdTime: f.createdTime, url: f.webViewLink, size: f.size ? Number(f.size) : null,
    editor: u.displayName || u.emailAddress || null, editorPhoto: u.photoLink || null,
  };
}

async function listFiles(token: string, q: string, orderBy: string, pageSize = 100) {
  const p = new URLSearchParams({ q, orderBy, pageSize: String(pageSize), fields: `files(${FILE_FIELDS})`, supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
  const data = await gapi(token, `${DRIVE}/files?${p}`);
  return ((data?.files || []) as Array<Record<string, unknown>>).map(shape);
}

async function getFile(token: string, id: string) {
  return shape(await gapi(token, `${DRIVE}/files/${id}?fields=${encodeURIComponent(FILE_FIELDS)}&supportsAllDrives=true`));
}

/** Everyone on the roster gets edit access to the team folder; files inside inherit it. */
async function shareFolderWithTeam(token: string, folderId: string, emails: string[]) {
  const data = await gapi(token, `${DRIVE}/files/${folderId}/permissions?fields=permissions(emailAddress,role,type,domain)&supportsAllDrives=true&pageSize=100`);
  const perms = (data?.permissions || []) as Array<Record<string, string>>;
  const has = (email: string) => {
    const lower = email.toLowerCase();
    return perms.some(p => (p.emailAddress || '').toLowerCase() === lower && ['writer', 'owner', 'organizer', 'fileOrganizer'].includes(p.role))
      || perms.some(p => p.type === 'domain' && lower.endsWith('@' + (p.domain || '').toLowerCase()) && ['writer', 'owner'].includes(p.role));
  };
  const added: string[] = [];
  for (const email of emails) {
    if (has(email)) continue;
    try {
      await gapi(token, `${DRIVE}/files/${folderId}/permissions?sendNotificationEmail=false&supportsAllDrives=true`, {
        method: 'POST',
        body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: email }),
      });
      added.push(email);
    } catch { /* an address Google will not accept; the rest still get access */ }
  }
  return added;
}

const ROLE_FOLDERS: Record<string, string> = {
  team: 'Everyone',
  technical: 'Technical Design and Systems',
  uiux: 'UI UX Design',
  aiml: 'AI ML',
  hitl: 'HITL and Human Factors',
  pm: 'Project Management',
  engagement: 'Community and Industry Engagement',
};

/** Team folder / <role folder>, created on first use. */
async function ensureRoleFolder(token: string, rootId: string, roleKey: string) {
  const find = async (parent: string, name: string) => {
    const q = `'${parent}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = '${MIME.folder}' and trashed = false`;
    const p = new URLSearchParams({ q, fields: 'files(id)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', pageSize: '1' });
    const data = await gapi(token, `${DRIVE}/files?${p}`);
    if (data?.files?.[0]?.id) return data.files[0].id as string;
    const made = await gapi(token, `${DRIVE}/files?fields=id&supportsAllDrives=true`, { method: 'POST', body: JSON.stringify({ name, mimeType: MIME.folder, parents: [parent] }) });
    return made.id as string;
  };
  return find(rootId, ROLE_FOLDERS[roleKey] || ROLE_FOLDERS.team);
}

async function uploadToDrive(token: string, metadata: Record<string, unknown>, blob: Blob, mime: string) {
  const boundary = 'suits' + crypto.randomUUID().replace(/-/g, '');
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const body = new Blob([head, blob, `\r\n--${boundary}--`]);
  const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=${encodeURIComponent(FILE_FIELDS)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new GoogleError(data?.error?.message || `Google returned ${r.status}`, r.status);
  return shape(data);
}

function parseDriveFileId(url: string) {
  const m = url.match(/\/d\/([A-Za-z0-9_-]{10,})/) || url.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || url.match(/folders\/([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

/** Give a team member edit access to the folder if they do not have it yet. */
async function ensureAccess(token: string, folderId: string, email: string) {
  const data = await gapi(token, `${DRIVE}/files/${folderId}/permissions?fields=permissions(emailAddress,role,type,domain)&supportsAllDrives=true&pageSize=100`);
  const perms = (data?.permissions || []) as Array<Record<string, string>>;
  const lower = email.toLowerCase();
  const has = perms.some(p => (p.emailAddress || '').toLowerCase() === lower && ['writer', 'owner', 'organizer', 'fileOrganizer'].includes(p.role))
    || perms.some(p => p.type === 'domain' && lower.endsWith('@' + (p.domain || '').toLowerCase()) && ['writer', 'owner'].includes(p.role))
    || perms.some(p => p.type === 'anyone' && ['writer'].includes(p.role));
  if (has) return 'already';
  await gapi(token, `${DRIVE}/files/${folderId}/permissions?sendNotificationEmail=false&supportsAllDrives=true`, {
    method: 'POST',
    body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: email }),
  });
  return 'granted';
}

// ---------------------------------------------------------------------------
// Proposal document: skeleton and check
// ---------------------------------------------------------------------------
async function writeSkeleton(token: string, docId: string, teamName: string) {
  // Build the text once, remembering where each heading and note sits, then
  // insert it in one request and style the ranges.
  let text = '';
  const headings: Array<{ start: number; end: number; level: 1 | 2 }> = [];
  const notes: Array<{ start: number; end: number }> = [];
  const add = (s: string) => { const start = text.length; text += s + '\n'; return { start, end: text.length }; };

  const title = add(`NASA SUITS 2027 Proposal`);
  headings.push({ ...title, level: 1 });
  add(teamName);
  add('');
  for (const s of PROPOSAL_SECTIONS) {
    headings.push({ ...add(s.heading), level: s.level });
    if (s.note) notes.push(add(s.note));
    add('');
  }

  const requests: unknown[] = [{ insertText: { location: { index: 1 }, text } }];
  // Everything 12 point first, then headings on top.
  requests.push({ updateTextStyle: { range: { startIndex: 1, endIndex: text.length + 1 }, textStyle: { fontSize: { magnitude: 12, unit: 'PT' } }, fields: 'fontSize' } });
  for (const n of notes) {
    requests.push({ updateTextStyle: { range: { startIndex: n.start + 1, endIndex: n.end }, textStyle: { italic: true, foregroundColor: { color: { rgbColor: { red: 0.45, green: 0.45, blue: 0.45 } } } }, fields: 'italic,foregroundColor' } });
  }
  for (const h of headings) {
    requests.push({ updateParagraphStyle: { range: { startIndex: h.start + 1, endIndex: h.end }, paragraphStyle: { namedStyleType: h === headings[0] ? 'TITLE' : h.level === 1 ? 'HEADING_1' : 'HEADING_2' }, fields: 'namedStyleType' } });
  }
  await gapi(token, `${DOCS}/documents/${docId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
}

interface Para { text: string; style: string }

function walk(content: Array<Record<string, unknown>>, out: Para[]) {
  for (const el of content || []) {
    const p = el.paragraph as Record<string, unknown> | undefined;
    if (p) {
      const style = ((p.paragraphStyle as Record<string, string>) || {}).namedStyleType || 'NORMAL_TEXT';
      const text = ((p.elements as Array<Record<string, unknown>>) || []).map(e => ((e.textRun as Record<string, string>) || {}).content || '').join('');
      out.push({ text, style });
    }
    const t = el.table as Record<string, unknown> | undefined;
    if (t) for (const row of (t.tableRows as Array<Record<string, unknown>>) || []) for (const cell of (row.tableCells as Array<Record<string, unknown>>) || []) walk(cell.content as Array<Record<string, unknown>>, out);
    const toc = el.tableOfContents as Record<string, unknown> | undefined;
    if (toc) walk(toc.content as Array<Record<string, unknown>>, out);
  }
}

function words(s: string) {
  return (s.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length;
}

function analyze(doc: Record<string, unknown>) {
  const paras: Para[] = [];
  walk(((doc.body as Record<string, unknown>) || {}).content as Array<Record<string, unknown>>, paras);
  const isHeading = (p: Para) => p.style.startsWith('HEADING_') || p.style === 'TITLE' || p.style === 'SUBTITLE';

  // Split into sections by heading
  const sections: Array<{ heading: string; level: number; words: number; index: number }> = [];
  let current: { heading: string; level: number; words: number; index: number } | null = null;
  let totalWords = 0;
  for (const p of paras) {
    if (isHeading(p) && p.text.trim()) {
      const level = p.style === 'TITLE' ? 0 : Number(p.style.replace('HEADING_', '')) || 1;
      current = { heading: p.text.trim(), level, words: 0, index: sections.length };
      sections.push(current);
    } else {
      const w = words(p.text);
      totalWords += w;
      if (current) current.words += w;
    }
  }

  // Which required sections exist
  const found = PROPOSAL_SECTIONS.map(s => {
    const hit = sections.find(x => s.match.test(x.heading));
    return { heading: s.heading, level: s.level, present: !!hit, words: hit?.words ?? 0 };
  });

  // Technical section: everything from its heading until the next level 1 heading
  const techStart = sections.findIndex(s => /^technical section/i.test(s.heading));
  let techWords = 0;
  if (techStart >= 0) {
    for (let i = techStart; i < sections.length; i++) {
      if (i > techStart && sections[i].level <= sections[techStart].level) break;
      techWords += sections[i].words;
    }
  }
  const abstract = sections.find(s => /^abstract/i.test(s.heading));

  return {
    totalWords,
    techWords,
    // 12 point body text runs about 500 words a page with headings and figures
    techPages: Math.round((techWords / 500) * 10) / 10,
    abstractWords: abstract?.words ?? 0,
    sections: found,
    headings: sections.map(s => ({ heading: s.heading, level: s.level, words: s.words })),
  };
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not signed in' }, 401);

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user || !TEAM_EMAIL.test(user.email || '')) return json({ error: 'Not signed in with a UMD account' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: member } = await admin.from('suits_team').select('display_name, role').eq('user_id', user.id).single();
  if (!member) return json({ error: 'You are not on the team roster yet. Open the dashboard once to join.' }, 403);
  const isManager = member.role === 'product_manager' || member.role === 'lead';

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const action = String(body.action || '');

  // Service account
  let sa: ServiceAccount | null = null;
  const raw = Deno.env.get('SUITS_GOOGLE_SERVICE_ACCOUNT');
  if (raw) {
    try { sa = JSON.parse(raw); } catch { sa = null; }
    if (sa && (!sa.client_email || !sa.private_key)) sa = null;
  }

  // Settings
  const { data: settingRows } = await admin.from('suits_settings').select('key, value').in('key', ['drive_folder', 'drive_proposal']);
  const settings: Record<string, Record<string, string>> = {};
  for (const r of settingRows || []) settings[r.key] = r.value;
  const folder = settings.drive_folder?.id ? settings.drive_folder : null;
  const proposal = settings.drive_proposal?.id ? settings.drive_proposal : null;
  const saveSetting = async (key: string, value: unknown) => {
    await admin.from('suits_settings').upsert({ key, value, updated_by: user.id, updated_at: new Date().toISOString() });
  };

  try {
    if (action === 'status') {
      if (!sa) return json({ configured: false, reason: raw ? 'key could not be parsed' : 'key not set', serviceEmail: null, folder, proposal: null, access: null, isManager });
      let access: string | null = null;
      let accessError: string | null = null;
      if (folder) {
        try {
          const token = await accessToken(sa);
          access = await ensureAccess(token, folder.id, user.email!);
        } catch (err) {
          accessError = (err as Error).message;
        }
      }
      return json({ configured: true, serviceEmail: sa.client_email, folder, proposal, access, accessError, isManager });
    }

    // Mirror a dashboard document into the team folder and make sure the whole team can edit it
    if (action === 'sync') {
      const { data: docRow } = await admin.from('suits_documents').select('*').eq('id', String(body.documentId || '')).single();
      if (!docRow) return json({ error: 'Document not found' }, 404);
      const mark = (patch: Record<string, unknown>) => admin.from('suits_documents').update(patch).eq('id', docRow.id);
      if (!sa || !folder) {
        await mark({ drive_status: 'not_connected', drive_error: null });
        return json({ drive_status: 'not_connected' });
      }
      try {
        const token = await accessToken(sa);
        const roleFolder = await ensureRoleFolder(token, folder.id, String(docRow.role || 'team'));
        let file: ReturnType<typeof shape> | null = null;
        if (docRow.kind === 'file' && docRow.storage_path) {
          const { data: blob, error } = await admin.storage.from('suits-docs').download(docRow.storage_path);
          if (error || !blob) throw new Error(error?.message || 'Could not read the uploaded file');
          const ext = (docRow.storage_path.match(/\.[A-Za-z0-9]{1,6}$/) || [''])[0];
          const name = /\.[A-Za-z0-9]{1,6}$/.test(docRow.title) ? docRow.title : docRow.title + ext;
          file = await uploadToDrive(token, { name, parents: [roleFolder] }, blob, docRow.mime || 'application/octet-stream');
        } else if (docRow.kind === 'link' && docRow.url) {
          const targetId = parseDriveFileId(docRow.url);
          if (!targetId || !/(docs|drive)\.google\.com/.test(docRow.url)) {
            await mark({ drive_status: 'skipped', drive_error: null });
            return json({ drive_status: 'skipped' });
          }
          file = shape(await gapi(token, `${DRIVE}/files?fields=${encodeURIComponent(FILE_FIELDS)}&supportsAllDrives=true`, {
            method: 'POST',
            body: JSON.stringify({ name: docRow.title, mimeType: 'application/vnd.google-apps.shortcut', parents: [roleFolder], shortcutDetails: { targetId } }),
          }));
        } else {
          throw new Error('Nothing to send to Drive');
        }
        const { data: roster } = await admin.from('suits_team').select('email');
        const added = await shareFolderWithTeam(token, folder.id, (roster || []).map((r: { email: string }) => r.email));
        await mark({ drive_file_id: file.id, drive_url: file.url, drive_status: 'synced', drive_error: null });
        return json({ drive_status: 'synced', drive_url: file.url, shared_with: added });
      } catch (err) {
        const message = (err as Error).message || 'Drive sync failed';
        await mark({ drive_status: 'error', drive_error: message });
        return json({ drive_status: 'error', error: message });
      }
    }

    if (!sa) return json({ error: 'Google Drive is not connected yet. The team lead adds the service account key first.' }, 500);
    const token = await accessToken(sa);

    if (action === 'setFolder') {
      if (!isManager) return json({ error: 'Only product managers and the lead can set the team folder' }, 403);
      const id = parseFolderId(String(body.url || ''));
      if (!id) return json({ error: 'That does not look like a Google Drive folder link.' }, 400);
      let f;
      try {
        f = await getFile(token, id);
      } catch (err) {
        const status = (err as GoogleError).status;
        if (status === 404 || status === 403) return json({ error: `The service account cannot open that folder yet. In Google Drive, share the folder with ${sa.client_email} as an Editor, then try again.` }, 400);
        throw err;
      }
      if (f.kind !== 'folder') return json({ error: 'That link is a file, not a folder. Paste the link of the team folder.' }, 400);
      const value = { id: f.id, name: f.name, url: f.url };
      await saveSetting('drive_folder', value);
      let access: string | null = null;
      try { access = await ensureAccess(token, f.id, user.email!); } catch { access = null; }
      return json({ folder: value, access });
    }

    if (!folder) return json({ error: 'The team folder is not set yet.' }, 400);

    if (action === 'list') {
      const parent = String(body.folderId || folder.id);
      const files = await listFiles(token, `'${parent}' in parents and trashed = false`, 'folder,name');
      const info = parent === folder.id ? folder : await getFile(token, parent);
      return json({ folder: { id: info.id, name: info.name, url: info.url }, files });
    }

    if (action === 'recent') {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const files = await listFiles(token, `modifiedTime > '${since}' and trashed = false and mimeType != '${MIME.folder}'`, 'modifiedTime desc', 15);
      return json({ files });
    }

    if (action === 'create') {
      const k = String(body.kind || 'doc') as keyof typeof MIME;
      if (!MIME[k]) return json({ error: 'Unknown file type' }, 400);
      const name = String(body.name || '').trim().slice(0, 200);
      if (!name) return json({ error: 'Give the file a name.' }, 400);
      const parent = String(body.parentId || folder.id);
      const f = shape(await gapi(token, `${DRIVE}/files?fields=${encodeURIComponent(FILE_FIELDS)}&supportsAllDrives=true`, {
        method: 'POST',
        body: JSON.stringify({ name, mimeType: MIME[k], parents: [parent] }),
      }));
      if (k === 'doc' && body.template === 'proposal') {
        await writeSkeleton(token, f.id as string, String(body.teamName || 'University of Maryland XR Club'));
        if (isManager) await saveSetting('drive_proposal', { id: f.id, name: f.name, url: f.url });
      }
      return json({ file: f });
    }

    if (action === 'setProposal') {
      if (!isManager) return json({ error: 'Only product managers and the lead can choose the proposal document' }, 403);
      if (!body.fileId) { await admin.from('suits_settings').delete().eq('key', 'drive_proposal'); return json({ proposal: null }); }
      const f = await getFile(token, String(body.fileId));
      if (f.kind !== 'doc') return json({ error: 'The proposal has to be a Google Doc.' }, 400);
      const value = { id: f.id, name: f.name, url: f.url };
      await saveSetting('drive_proposal', value);
      return json({ proposal: value });
    }

    if (action === 'proposal') {
      if (!proposal) return json({ error: 'No proposal document chosen yet.' }, 400);
      const [doc, file] = await Promise.all([
        gapi(token, `${DOCS}/documents/${proposal.id}?suggestionsViewMode=PREVIEW_WITHOUT_SUGGESTIONS`),
        getFile(token, proposal.id),
      ]);
      return json({ proposal: { ...proposal, name: file.name, modifiedTime: file.modifiedTime, editor: file.editor }, ...analyze(doc) });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    const status = (err as GoogleError).status;
    if (status === 401) cachedToken = null;
    return json({ error: (err as Error).message || 'Something went wrong' }, status && status >= 400 && status < 600 ? 502 : 500);
  }
});
