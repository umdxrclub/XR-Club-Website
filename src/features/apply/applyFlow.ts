// The projects page: a fluid background with a swimmer in it, and two short forms (an application to a project,
// a funding proposal) laid out one step per screen. Everyone starts with their details, then chooses a project
// or the proposal; scrolling morphs each step into the next, a step validates before moving on, drafts stay in
// this browser, and submissions go to Supabase.
import { mountFluid, fluidColor, type Fluid } from './fluid';
import { mountAxolotl, axolotlSheets } from './axolotl';
import { edgeClip, morphEdges } from './morph';
import { availabilityOptions, teams } from './applyContent';

declare global {
  interface Window {
    xrSuitsReveal?: (update: () => Promise<void> | void) => Promise<void>;
    xrSuitsHeld?: () => boolean;
  }
}

const UMD_EMAIL = /^[^\s@]+@(terpmail\.)?umd\.edu$/i;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = (t: number) => { const c = clamp(t); return c * c * (3 - 2 * c); };
/** How long a button-driven morph takes. */
const TURN_MS = 640;
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export function mountApply(root: HTMLElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scroller = root.querySelector<HTMLElement>('[data-apply-scroller]')!;
  const snaps = root.querySelector<HTMLElement>('[data-apply-snaps]')!;
  const steps = [...root.querySelectorAll<HTMLElement>('[data-step]')];
  const rail = root.querySelector<HTMLElement>('[data-apply-rail]')!;
  const listeners = new AbortController(), options = { signal: listeners.signal };
  const disposers: (() => void)[] = [];
  // Elements made here carry the page's scoped-style attribute, so the component's CSS applies to them too.
  const scope = root.getAttributeNames().find(name => name.startsWith('data-astro-cid-'));
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '') => { const element = document.createElement(tag); if (scope) element.setAttribute(scope, ''); if (className) element.className = className; return element; };
  // Steps start below the fixed header and the progress bar, whatever height the header takes on this screen.
  const header = document.querySelector<HTMLElement>('.site-header');
  const headerBottom = () => header?.getBoundingClientRect().bottom ?? 90;
  const placeSteps = () => { root.style.setProperty('--apply-top', `${Math.round(headerBottom() + 56)}px`); };
  placeSteps();

  // --- Background -------------------------------------------------------------------------------------
  const fluidCanvas = root.querySelector<HTMLCanvasElement>('[data-apply-fluid]')!;
  let swimmer: ReturnType<typeof mountAxolotl> = null;
  const phone = Math.min(innerWidth, innerHeight) < 700;
  let fluid: Fluid | null = null;
  // Open on colour, not on an empty dark field. With reduced motion the field settles once and then holds still.
  const startFluid = (): Fluid | null => {
    try {
      const started = mountFluid(fluidCanvas, {
        simResolution: phone ? 128 : 192, dyeResolution: phone ? 512 : 1024, pressureIterations: phone ? 14 : 18, densityDissipation: .992, pixelRatio: Math.min(devicePixelRatio || 1, phone ? 1 : 1.25),
        // A lost GPU context (a backgrounded phone tab, a driver reset) comes back as a fresh simulation.
        onRestore: () => { fluid = startFluid(); },
      });
      if (!started) return null;
      started.randomSplats(phone ? 8 : 14, 900);
      if (reduced) { started.settle(90); started.setPaused(true); }
      return started;
    } catch (error) { console.warn('The fluid background could not start.', error); return null; }
  };
  fluid = startFluid();
  root.dataset.fluid = fluid ? 'on' : 'off';
  if (fluid) {
    let idle = 0;
    // An idle burst somewhere in the field; the swimmer feels it when it is close.
    const burst = () => {
      const sx = Math.random() * fluidCanvas.clientWidth, sy = Math.random() * fluidCanvas.clientHeight;
      const dx = 560 * (Math.random() - .5) / 6, dy = 560 * (Math.random() - .5) / 6;
      fluid?.splat(sx, sy, dx, dy, fluidColor().map(c => c * 10) as [number, number, number]);
      swimmer?.nudge(sx, sy, dx * 2.5, dy * 2.5);
    };
    const idleSplat = () => {
      if (!document.hidden && !reduced) { burst(); if (Math.random() < .3) burst(); }
      idle = window.setTimeout(idleSplat, 420 + Math.random() * 900);
    };
    idle = window.setTimeout(idleSplat, 700);
    let lastPointer: { x: number; y: number; t: number } | null = null;
    // Pointer splats would never fade on a held-still field, so reduced motion leaves them out.
    if (!reduced) addEventListener('pointermove', event => {
      if (event.pointerType === 'touch' && !event.isPrimary) return;
      const now = performance.now();
      if (lastPointer) {
        const dt = Math.max(8, now - lastPointer.t) / 1000;
        const dx = (event.clientX - lastPointer.x) / dt, dy = (event.clientY - lastPointer.y) / dt;
        if (Math.abs(dx) + Math.abs(dy) > 40) { fluid?.splat(event.clientX, event.clientY, dx * .55, dy * .55, undefined, .22); swimmer?.nudge(event.clientX, event.clientY, dx * .35, dy * .35); }
      }
      lastPointer = { x: event.clientX, y: event.clientY, t: now };
    }, { ...options, passive: true });
    if (!reduced) addEventListener('pointerdown', event => {
      const dx = (Math.random() - .5) * 600, dy = (Math.random() - .5) * 600;
      fluid?.splat(event.clientX, event.clientY, dx, dy, fluidColor().map(c => c * 6) as [number, number, number], .6);
      swimmer?.nudge(event.clientX, event.clientY, dx, dy);
    }, { ...options, passive: true });
    document.addEventListener('visibilitychange', () => fluid?.setPaused(document.hidden || reduced), options);
    disposers.push(() => { clearTimeout(idle); fluid?.dispose(); });
  }
  const swimmerCanvas = root.querySelector<HTMLCanvasElement>('[data-apply-swimmer]')!;
  const base = (document.querySelector('base')?.getAttribute('href') ?? '/').replace(/\/?$/, '/');
  const sheet = phone ? axolotlSheets.small : axolotlSheets.large;
  swimmer = mountAxolotl(swimmerCanvas, { sheet: { ...sheet, src: base + sheet.src }, width: phone ? 150 : Math.round(Math.min(160, innerWidth * .12)), reduced });
  disposers.push(() => swimmer?.dispose());
  // The swimmer keeps clear of the header and the footer.
  const placeSwimmer = () => swimmer?.setInsets(headerBottom() + 8, (parseFloat(getComputedStyle(root).getPropertyValue('--site-footer-height')) || 0) + 8);
  placeSwimmer();

  // --- Steps and morphing ----------------------------------------------------------------------------
  // Every step sits on one stage pinned to the screen; the scroller behind it only supplies a position. Between two
  // steps one liquid edge sweeps up the screen: the step being left keeps what is above it and the step arriving
  // shows what is below it, so the screen is never empty halfway. Buttons run the same morph on a clock instead.
  const panels = steps.map(step => step.querySelector<HTMLElement>('.apply__panel')!);
  const phases = steps.map((_, i) => i * 1.7);
  const visible = () => steps.filter(step => !step.hidden);
  const height = () => scroller.clientHeight || innerHeight;
  // One snap target per visible step gives the scroller its length and its resting points.
  const layout = () => {
    const count = visible().length;
    root.style.setProperty('--apply-steps', String(count));
    while (snaps.children.length < count) snaps.append(make('div', 'apply__snap'));
    while (snaps.children.length > count) snaps.lastElementChild!.remove();
  };
  layout();
  let active = steps[0];
  const painted = new Map<HTMLElement, string>();
  const put = (i: number, clip: string, transform: string, opacity: string, shown: boolean) => {
    const step = steps[i], key = `${clip}|${transform}|${opacity}|${shown}`;
    if (painted.get(step) === key) return;
    painted.set(step, key);
    step.style.clipPath = clip; panels[i].style.transform = transform; panels[i].style.opacity = opacity;
    step.toggleAttribute('data-shown', shown);
  };
  /** Draws the stage between two neighbouring steps: f is 0 resting on `upper`, 1 resting on `lower`. */
  const render = (upper: HTMLElement, lower: HTMLElement | undefined, f: number) => {
    const h = height(), w = scroller.clientWidth || innerWidth;
    const between = !!lower && f > .001 && f < .999;
    active = lower && f >= .5 ? lower : upper;
    const { leave, arrive, amplitude } = morphEdges(f, h);
    const phase = phases[steps.indexOf(upper)] + f * 2.5, eased = smooth(f);
    steps.forEach((step, i) => {
      if (between && step === upper) {
        if (reduced) put(i, '', '', (1 - f).toFixed(3), true);
        else put(i, edgeClip(leave, amplitude, phase, w, h, true), `translate3d(0, ${(-eased * 10).toFixed(2)}vh, 0)`, (1 - eased * .3).toFixed(3), true);
      } else if (between && step === lower) {
        if (reduced) put(i, '', '', f.toFixed(3), true);
        else put(i, edgeClip(arrive, amplitude, phase, w, h, false), `translate3d(0, ${((1 - eased) * 8).toFixed(2)}vh, 0)`, '', true);
      } else put(i, '', '', '', step === active);
      // Only the step being read takes focus or clicks.
      step.toggleAttribute('inert', step !== active);
    });
  };
  type Turn = { upper: HTMLElement; lower: HTMLElement; from: number; to: number; start: number };
  let turning: Turn | null = null, frame = 0;
  const paint = () => {
    frame = 0;
    const list = visible(), h = height();
    if (turning) {
      const t = clamp((performance.now() - turning.start) / TURN_MS);
      render(turning.upper, turning.lower, turning.from + (turning.to - turning.from) * smooth(t));
      if (t >= 1) turning = null; else frame = requestAnimationFrame(paint);
    } else {
      const s = clamp(scroller.scrollTop / h, 0, list.length - 1), i = Math.min(list.length - 1, Math.floor(s + .001));
      render(list[i], list[i + 1], clamp(s - i));
    }
    // The progress bar marks the step being read; the swimmer steers around (or softens under) the reading column.
    const flow = active.dataset.flow ?? '';
    if (flow !== railFlow) buildRail(flow);
    const current = steps.indexOf(active);
    rail.querySelectorAll('button').forEach(b => {
      const index = Number(b.dataset.index);
      if (index === current) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.toggleAttribute('data-done', index < current);
    });
    swimmer?.setKeepOut(panels[current].getBoundingClientRect());
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
  // Buttons put the scroller on the step at once (the stage is pinned, so nothing visibly moves) and morph there on a
  // clock, so a long jump is one morph rather than a blur of every step between.
  const go = (target: HTMLElement) => {
    target.hidden = false; layout();
    const list = visible(), k = list.indexOf(target), h = height();
    if (k < 0) return;
    const s = scroller.scrollTop / h, nearest = clamp(Math.round(s), 0, list.length - 1);
    const from = turning ? (turning.to ? turning.lower : turning.upper) : list[nearest];
    const resting = !!turning || Math.abs(s - nearest) < .02;
    turning = null;
    scroller.scrollTo({ top: k * h, behavior: 'instant' as ScrollBehavior });
    if (!reduced && resting && from !== target) {
      const forward = list.indexOf(from) < k;
      turning = { upper: forward ? from : target, lower: forward ? target : from, from: forward ? 0 : 1, to: forward ? 1 : 0, start: performance.now() };
    }
    schedule();
  };
  const byName = (name: string) => steps.find(step => step.dataset.step === name)!;
  const neighbour = (from: HTMLElement, direction: 1 | -1) => { const list = visible(); return list[list.indexOf(from) + direction]; };
  const next = (from: HTMLElement) => { const target = neighbour(from, 1); if (target) go(target); };
  const previous = (from: HTMLElement) => { const target = neighbour(from, -1); if (target) go(target); };
  const turn = (direction: 1 | -1) => { if (turning) return; const target = neighbour(active, direction); if (target) go(target); };
  root.addEventListener('scroll', schedule, { ...options, capture: true, passive: true });
  root.addEventListener('input', schedule, options);
  addEventListener('resize', () => { placeSteps(); placeSwimmer(); scroller.scrollTo({ top: visible().indexOf(active) * height(), behavior: 'instant' as ScrollBehavior }); schedule(); }, options);
  // A wheel turns one step per gesture. A step with more than a screen of content scrolls itself first, and the
  // tail of a trackpad flick is swallowed rather than turning a second step.
  const wheel = { at: 0, delta: 0, inner: false };
  scroller.addEventListener('wheel', event => {
    const delta = Math.abs(event.deltaY);
    if (delta < .5 || Math.abs(event.deltaX) > delta) return;
    const now = performance.now(), fresh = now - wheel.at > 160 || delta > wheel.delta * 1.6;
    wheel.at = now; wheel.delta = delta;
    const step = event.target instanceof Element ? event.target.closest<HTMLElement>('.apply__step') : null;
    const canScroll = !!step && step.scrollHeight > step.clientHeight + 1 && (event.deltaY > 0 ? step.scrollTop + step.clientHeight < step.scrollHeight - 1 : step.scrollTop > 0);
    if (fresh) wheel.inner = canScroll;
    if (wheel.inner) { if (!canScroll) event.preventDefault(); return; }
    event.preventDefault();
    if (fresh) turn(event.deltaY > 0 ? 1 : -1);
  }, { ...options, passive: false });
  // Page and arrow keys turn steps too, unless a field or a button has them.
  addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    if (event.key === ' ' && target?.closest('button, a, summary, [role="button"]')) return;
    const direction = event.key === 'PageDown' || event.key === 'ArrowDown' || (event.key === ' ' && !event.shiftKey) ? 1 : event.key === 'PageUp' || event.key === 'ArrowUp' || (event.key === ' ' && event.shiftKey) ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    // A step with more than a screen of content reads on before the deck turns, like the wheel.
    const room = direction > 0 ? active.scrollHeight - active.clientHeight - active.scrollTop : active.scrollTop;
    if (room > 1) active.scrollBy({ top: direction * active.clientHeight * .8, behavior: reduced ? 'auto' : 'smooth' });
    else turn(direction);
  }, options);
  /** Scrolls a step with more than a screen of content so a field shows below the header. */
  const reveal = (field: HTMLElement) => {
    const step = field.closest<HTMLElement>('.apply__step');
    if (!step || step.scrollHeight <= step.clientHeight + 1) return;
    const top = parseFloat(getComputedStyle(root).getPropertyValue('--apply-top')) || 148;
    const box = step.getBoundingClientRect(), at = field.getBoundingClientRect();
    if (at.top < box.top + top) step.scrollTop += at.top - box.top - top;
    else if (at.bottom > box.bottom - 24) step.scrollTop += at.bottom - box.bottom + 24;
  };

  // --- Progress ------------------------------------------------------------------------------------------
  // One segment per step of the flow being read (the application's or the proposal's); none on the opening screens.
  let railFlow = '';
  const buildRail = (flow = railFlow) => {
    railFlow = flow;
    const shown = flow === 'start' || !flow ? [] : visible().filter(step => step.dataset.flow === flow && !step.dataset.step!.endsWith('done'));
    rail.hidden = shown.length < 2;
    rail.replaceChildren(...shown.map(step => {
      const button = make('button');
      button.type = 'button'; button.dataset.index = String(steps.indexOf(step));
      button.setAttribute('aria-label', step.querySelector('.apply__title')?.textContent?.trim() || step.dataset.step || 'Step');
      button.addEventListener('click', () => go(step));
      return button;
    }));
  };
  buildRail('start');

  // --- Validation ---------------------------------------------------------------------------------------
  // An invalid field shows why underneath it; a field with its own note (the members count) colours that instead.
  const hint = (field: HTMLElement, invalid: boolean) => {
    field.setAttribute('aria-invalid', String(invalid));
    const holder = field.closest('.apply__field');
    if (!holder) return;
    const own = holder.querySelector<HTMLElement>('.apply__hint:not([data-note])');
    if (own) { own.toggleAttribute('data-invalid', invalid); return; }
    let note = holder.querySelector<HTMLElement>('.apply__hint[data-note]');
    if (!invalid) { note?.remove(); return; }
    if (!note) { note = make('span', 'apply__hint'); note.dataset.note = ''; note.toggleAttribute('data-invalid', true); holder.append(note); }
    note.textContent = (field as Field).value.trim() ? (field.dataset.hint || 'Enter a valid value') : 'Required';
  };
  // You are the lead: the members list is everyone else, and the team is three to ten people with you.
  const members = (value: string) => value.split('\n').map(line => line.trim()).filter(Boolean);
  const membersField = root.querySelector<HTMLTextAreaElement>('[data-members]');
  const membersCount = root.querySelector<HTMLElement>('[data-members-count]');
  const updateMembers = () => {
    if (!membersField || !membersCount) return;
    const count = members(membersField.value).length + 1;
    membersCount.textContent = count > 1 ? `${count} people including you${count < 3 ? ' (at least 3)' : count > 10 ? ' (at most 10)' : ''}` : 'Three to ten people including you';
  };
  membersField?.addEventListener('input', updateMembers, options);
  updateMembers();
  const validField = (field: Field) => {
    const value = field.value.trim();
    let ok = field.checkValidity();
    if (field.hasAttribute('data-umd-email')) ok = ok && UMD_EMAIL.test(value);
    if (field.hasAttribute('data-members')) { const n = members(value).length + 1; ok = ok && n >= 3 && n <= 10; }
    if ((field as HTMLInputElement).type === 'radio') ok = !!(field.closest('.apply__chips') ?? root).querySelector(`input[name="${field.name}"]:checked`);
    return ok;
  };
  const validateStep = (step: HTMLElement) => {
    const fields = [...step.querySelectorAll<Field>('input, textarea, select')].filter(f => !f.closest('[hidden]') && !f.classList.contains('apply__honey') && f.type !== 'hidden');
    let first: HTMLElement | undefined;
    for (const field of fields) {
      const ok = validField(field);
      if (field.type !== 'radio' && field.type !== 'checkbox') hint(field, !ok);
      if (field.type === 'radio' || field.type === 'checkbox') field.closest('.apply__chips, .apply__check')?.classList.toggle('is-invalid', !ok);
      if (!ok && !first) first = field;
    }
    if (first) { reveal(first); first.focus({ preventScroll: true }); return false; }
    return true;
  };
  root.addEventListener('input', event => {
    const field = event.target as HTMLInputElement;
    if (field.matches('.apply__input') && field.getAttribute('aria-invalid') === 'true' && validField(field)) hint(field, false);
  }, options);
  root.addEventListener('change', event => {
    const field = event.target as HTMLInputElement;
    if (field.type === 'radio' || field.type === 'checkbox') field.closest('.apply__chips, .apply__check')?.classList.remove('is-invalid');
  }, options);

  // --- Who you are ------------------------------------------------------------------------------------------
  // The opening screen's details serve both forms, and are kept as their own draft.
  const basics = root.querySelector<HTMLElement>('[data-basics]')!;
  const intro = byName('intro');
  const basic = (name: string) => (basics.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`) ?? basics.querySelector<Field>(`[name="${name}"]`))?.value.trim() ?? '';
  const BASICS_KEY = 'xr:apply:basics';
  const saveBasics = () => {
    const data: Record<string, string> = {};
    basics.querySelectorAll<Field>('[name]').forEach(field => { if (!(field instanceof HTMLInputElement && field.type === 'radio') || field.checked) data[field.name] = field.value; });
    try { localStorage.setItem(BASICS_KEY, JSON.stringify(data)); } catch { /* storage may be blocked */ }
  };
  try {
    const saved = JSON.parse(localStorage.getItem(BASICS_KEY) || 'null') as Record<string, string> | null;
    if (saved) basics.querySelectorAll<Field>('[name]').forEach(field => {
      if (!(field.name in saved)) return;
      if (field instanceof HTMLInputElement && field.type === 'radio') field.checked = field.value === saved[field.name]; else field.value = saved[field.name];
    });
  } catch { /* ignore */ }
  intro.addEventListener('input', saveBasics, options);
  intro.addEventListener('change', saveBasics, options);

  // --- Choosing -----------------------------------------------------------------------------------------------
  // Picking a project puts the application on the deck; picking the proposal puts the proposal on it instead.
  const pitchForm = root.querySelector<HTMLFormElement>('[data-apply-form="pitch"]')!;
  const teamForm = root.querySelector<HTMLFormElement>('[data-apply-form="team"]')!;
  const teamField = root.querySelector<HTMLInputElement>('[data-team-field]')!;
  const branch = (form: HTMLFormElement) => {
    for (const other of [pitchForm, teamForm]) other.querySelectorAll<HTMLElement>('[data-step]:not([data-step$="done"])').forEach(step => { step.hidden = other !== form; });
    layout();
    if (railFlow !== 'start') buildRail();
  };
  const chooseTeam = (slug: string) => {
    if (!teams.some(team => team.slug === slug)) return;
    teamField.value = slug;
    for (const attribute of ['data-team-info', 'data-team-question', 'data-team-tools', 'data-team-meeting', 'data-team-aside']) {
      root.querySelectorAll<HTMLElement>(`[${attribute}]`).forEach(element => { element.hidden = element.getAttribute(attribute) !== slug; });
    }
    branch(teamForm);
    saveDraft(teamForm);
  };

  // --- Buttons --------------------------------------------------------------------------------------------
  root.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const nextButton = target.closest<HTMLElement>('[data-next]');
    if (nextButton) { const step = nextButton.closest<HTMLElement>('[data-step]')!; if (step.querySelector('input:not([type="hidden"]), textarea, select') && !validateStep(step)) return; next(step); return; }
    const backButton = target.closest<HTMLElement>('[data-back]');
    if (backButton) { previous(backButton.closest<HTMLElement>('[data-step]')!); return; }
    const jump = target.closest<HTMLElement>('[data-jump]');
    if (jump) { go(byName(jump.dataset.jump!)); return; }
    const pick = target.closest<HTMLElement>('[data-team-pick]');
    if (pick) { chooseTeam(pick.dataset.teamPick!); go(byName('team-info')); return; }
    if (target.closest('[data-pitch-pick]')) { branch(pitchForm); go(byName('project')); }
  }, options);
  // Enter in a single-line field moves on, like a tab through a conversation.
  root.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const field = event.target as HTMLElement;
    if (!(field instanceof HTMLInputElement) || field.type === 'checkbox' || field.type === 'radio') return;
    event.preventDefault();
    const step = field.closest<HTMLElement>('[data-step]')!;
    step.querySelector<HTMLElement>('[data-next], [data-submit]')?.click();
  }, options);

  // --- Budget ---------------------------------------------------------------------------------------------------
  const budget = root.querySelector<HTMLElement>('[data-budget]')!;
  const rows = budget.querySelector<HTMLElement>('[data-budget-rows]')!;
  const template = budget.querySelector<HTMLTemplateElement>('[data-budget-row]')!;
  const total = budget.querySelector<HTMLElement>('[data-budget-total]')!;
  const money = (n: number) => `$${Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const budgetItems = () => [...rows.querySelectorAll<HTMLElement>('.apply__budget-row')].map(row => ({
    name: row.querySelector<HTMLInputElement>('[name="budget_name"]')!.value.trim(),
    cost: Number(row.querySelector<HTMLInputElement>('[name="budget_cost"]')!.value) || 0,
    priority: row.querySelector<HTMLInputElement>('[name="budget_priority"]')!.value as 'must' | 'nice',
    link: row.querySelector<HTMLInputElement>('[name="budget_link"]')!.value.trim(),
  })).filter(item => item.name || item.cost || item.link);
  const updateTotal = () => { total.textContent = money(budgetItems().reduce((sum, item) => sum + item.cost, 0)); };
  const setPriority = (row: HTMLElement, priority: 'must' | 'nice') => {
    row.querySelector<HTMLInputElement>('[name="budget_priority"]')!.value = priority;
    row.querySelectorAll<HTMLButtonElement>('[data-priority]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.priority === priority)));
  };
  const addRow = (item?: { name: string; cost: number; priority: string; link: string }) => {
    const row = (template.content.cloneNode(true) as DocumentFragment).firstElementChild as HTMLElement;
    if (item) {
      row.querySelector<HTMLInputElement>('[name="budget_name"]')!.value = item.name;
      row.querySelector<HTMLInputElement>('[name="budget_cost"]')!.value = item.cost ? String(item.cost) : '';
      setPriority(row, item.priority === 'nice' ? 'nice' : 'must');
      row.querySelector<HTMLInputElement>('[name="budget_link"]')!.value = item.link;
    }
    rows.append(row);
  };
  budget.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-budget-add]')) { addRow(); rows.lastElementChild?.querySelector<HTMLInputElement>('input')?.focus(); }
    const remove = target.closest<HTMLElement>('[data-budget-remove]');
    if (remove) { remove.closest('.apply__budget-row')?.remove(); if (!rows.children.length) addRow(); updateTotal(); }
    const priority = target.closest<HTMLElement>('[data-priority]');
    if (priority) { setPriority(priority.closest<HTMLElement>('.apply__budget-row')!, priority.dataset.priority === 'nice' ? 'nice' : 'must'); refreshSummaries(); saveDraft(pitchForm); }
  }, options);
  budget.addEventListener('input', updateTotal, options);

  // --- Drafts ----------------------------------------------------------------------------------------------------
  const draftKey = (form: HTMLFormElement) => `xr:apply:${form.dataset.applyForm}`;
  const collect = (form: HTMLFormElement) => {
    const data: Record<string, string | string[]> = {};
    for (const [key, value] of new FormData(form)) {
      if (key.startsWith('budget_') || key === 'website') continue;
      if (key in data) { const current = data[key]; data[key] = Array.isArray(current) ? [...current, String(value)] : [current as string, String(value)]; }
      else data[key] = String(value);
    }
    if (form === pitchForm) (data as Record<string, unknown>).budget = budgetItems();
    return data as Record<string, unknown>;
  };
  let saveTimer = 0;
  const saveDraft = (form: HTMLFormElement) => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => { try { localStorage.setItem(draftKey(form), JSON.stringify(collect(form))); } catch { /* storage may be blocked */ } }, 250);
  };
  const restoreDraft = (form: HTMLFormElement) => {
    let data: Record<string, unknown> | null = null;
    try { data = JSON.parse(localStorage.getItem(draftKey(form)) || 'null'); } catch { data = null; }
    if (!data) return;
    for (const [key, value] of Object.entries(data)) {
      if (key === 'budget') { (value as { name: string; cost: number; priority: string; link: string }[]).forEach(item => addRow(item)); continue; }
      const fields = form.querySelectorAll<Field>(`[name="${key}"]`);
      fields.forEach(field => {
        if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) field.checked = Array.isArray(value) ? value.includes(field.value) : value === field.value || (field.type === 'checkbox' && value === 'on');
        else field.value = String(value);
      });
      // A saved project only shows its details again; the branch is chosen fresh each visit.
      if (key === 'team' && typeof value === 'string' && teams.some(team => team.slug === value)) {
        teamField.value = value;
        for (const attribute of ['data-team-info', 'data-team-question', 'data-team-tools', 'data-team-meeting', 'data-team-aside']) root.querySelectorAll<HTMLElement>(`[${attribute}]`).forEach(element => { element.hidden = element.getAttribute(attribute) !== value; });
      }
    }
  };
  for (const form of [pitchForm, teamForm]) {
    restoreDraft(form);
    form.addEventListener('input', () => saveDraft(form), options);
    form.addEventListener('change', () => saveDraft(form), options);
  }
  if (!rows.children.length) addRow();
  updateTotal(); updateMembers();

  // --- Review and submit ------------------------------------------------------------------------------------------
  const summarize = (target: HTMLElement, entries: [string, string][]) => {
    target.replaceChildren(...entries.filter(([, value]) => value).map(([label, value]) => {
      const dt = make('dt'); dt.textContent = label;
      const dd = make('dd'); dd.textContent = value;
      const wrap = make('div'); wrap.append(dt, dd); return wrap;
    }));
  };
  const pitchSummary = root.querySelector<HTMLElement>('[data-pitch-summary]')!;
  const teamSummary = root.querySelector<HTMLElement>('[data-team-summary]')!;
  const value = (form: HTMLFormElement, name: string) => (form.elements.namedItem(name) as HTMLInputElement | RadioNodeList | null)?.value?.trim?.() ?? (form.elements.namedItem(name) as RadioNodeList | null)?.value ?? '';
  const you = () => [basic('full_name'), basic('email'), basic('discord_username')].filter(Boolean).join(', ');
  const refreshSummaries = () => {
    const items = budgetItems();
    summarize(pitchSummary, [
      ['Project', value(pitchForm, 'project_title')], ['Summary', value(pitchForm, 'idea')], ['Topic', value(pitchForm, 'topic')],
      ['Lead', you()], ['Team', members(value(pitchForm, 'members')).join('\n')],
      ['Outline and MVP', value(pitchForm, 'outline')], ['Plan without funding', value(pitchForm, 'zero_dollar_plan')], ['Timeline', value(pitchForm, 'timeline')], ['Deliverable', value(pitchForm, 'deliverable')],
      ['Budget', items.length ? items.map(item => `${item.name || 'Item'}: ${money(item.cost)} (${item.priority === 'must' ? 'must have' : 'nice to have'})`).join('\n') + `\nTotal requested ${money(items.reduce((s, i) => s + i.cost, 0))}` : 'Lab equipment only'],
      ['Lab equipment', value(pitchForm, 'lab_equipment')],
    ]);
    const team = teams.find(t => t.slug === teamField.value);
    const tools = [...teamForm.querySelectorAll<HTMLInputElement>('input[name="tools"]:checked')].filter(input => !input.closest('[hidden]')).map(input => input.value);
    summarize(teamSummary, [
      ['Project', team?.name ?? ''], ['Contact', you()], ['Year and major', [basic('year'), basic('major')].filter(Boolean).join(', ')],
      ['Why this project', value(teamForm, 'pitch')], ['Tools', tools.join(', ')], ['Link', value(teamForm, 'link')],
      ['Availability', availabilityOptions.find(option => option.value === value(teamForm, 'availability'))?.label ?? value(teamForm, 'availability')], ['Anything else', value(teamForm, 'anything_else')],
    ]);
  };
  root.addEventListener('input', refreshSummaries, options);
  root.addEventListener('change', refreshSummaries, options);
  refreshSummaries();

  const submit = async (form: HTMLFormElement, event: SubmitEvent) => {
    event.preventDefault();
    const review = form.querySelector<HTMLElement>('[data-step$="review"]')!;
    const error = form.querySelector<HTMLElement>('[data-form-error]')!;
    error.hidden = true;
    if (form === teamForm && !teams.some(team => team.slug === teamField.value)) { go(byName('choose')); return; }
    // Your details and every step must pass, not just the review; the first problem comes back into view, and its
    // field takes focus once the turn has shown it.
    for (const step of [intro, ...[...form.querySelectorAll<HTMLElement>('[data-step]')].filter(step => !step.hidden && !step.dataset.step!.endsWith('done'))]) {
      if (!validateStep(step)) { go(step); setTimeout(() => validateStep(step), TURN_MS + 16); return; }
    }
    if ((form.elements.namedItem('website') as HTMLInputElement).value) { showDone(form); return; }
    const button = review.querySelector<HTMLButtonElement>('[data-submit]')!;
    button.disabled = true;
    try {
      const { supabase } = await import('../../lib/supabase');
      if (form === pitchForm) {
        const items = budgetItems();
        const { error: fail } = await supabase.from('funding_pitches').insert({
          project_title: value(form, 'project_title'), idea: value(form, 'idea'), topic: value(form, 'topic') || null,
          lead_name: basic('full_name'), lead_email: basic('email').toLowerCase(), lead_discord: basic('discord_username'),
          members: members(value(form, 'members')).map(line => { const [name, ...rest] = line.split(/[,;]/); return { name: name.trim(), detail: rest.join(',').trim() }; }),
          outline: value(form, 'outline'), zero_dollar_plan: value(form, 'zero_dollar_plan'), timeline: value(form, 'timeline'), deliverable: value(form, 'deliverable'),
          lab_equipment: value(form, 'lab_equipment') || null, budget_items: items, requested_total: items.reduce((sum, item) => sum + item.cost, 0),
          agreed_to_rules: (form.elements.namedItem('agreed_to_rules') as HTMLInputElement).checked,
        });
        if (fail) throw fail;
      } else {
        const { error: fail } = await supabase.from('team_applications').insert({
          team: teamField.value, full_name: basic('full_name'), email: basic('email').toLowerCase(), discord_username: basic('discord_username'),
          year: basic('year'), major: basic('major'), pitch: value(form, 'pitch'),
          tools: [...form.querySelectorAll<HTMLInputElement>('input[name="tools"]:checked')].filter(input => !input.closest('[hidden]')).map(input => input.value),
          link: value(form, 'link') || null, availability: value(form, 'availability'), anything_else: value(form, 'anything_else') || null,
        });
        if (fail) throw fail;
      }
      showDone(form);
    } catch (fail) {
      const message = (fail as Error).message || '';
      // A dropped connection reads as a fetch failure; say what to do rather than what the browser threw.
      error.textContent = !message || /failed to fetch|network/i.test(message) ? 'Could not submit. Check your connection and try again.' : `Could not submit: ${message}`;
      error.hidden = false;
      button.disabled = false;
    }
  };
  const showDone = (form: HTMLFormElement) => {
    try { localStorage.removeItem(draftKey(form)); } catch { /* ignore */ }
    const done = form.querySelector<HTMLElement>('[data-step$="done"]')!;
    done.hidden = false;
    buildRail(done.dataset.flow);
    go(done);
    if (fluid) fluid.randomSplats(phone ? 5 : 9, 900);
    form.querySelectorAll<HTMLButtonElement>('[data-submit]').forEach(button => { button.disabled = false; });
  };
  pitchForm.addEventListener('submit', event => void submit(pitchForm, event), options);
  teamForm.addEventListener('submit', event => void submit(teamForm, event), options);

  // --- Arrival ---------------------------------------------------------------------------------------------------------
  // Arriving from another page, the previous page is held until the background has drawn; then the liquid reveal plays.
  const arrive = async () => {
    if (fluid) await Promise.race([fluid.ready, new Promise(resolve => setTimeout(resolve, 1500))]);
    if (window.xrSuitsHeld?.()) await window.xrSuitsReveal?.(() => undefined);
  };
  void arrive();
  schedule();

  return () => {
    listeners.abort(); cancelAnimationFrame(frame); clearTimeout(saveTimer);
    disposers.forEach(dispose => dispose());
  };
}
