import { mountApplyBackground } from './applyBackground';
import { teams } from './applyContent';

declare global {
  interface Window {
    xrSuitsReveal?: (update: () => Promise<void> | void) => Promise<void>;
    xrSuitsHeld?: () => boolean;
  }
}

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const UMD_EMAIL = /^[^\s@]+@(terpmail\.)?umd\.edu$/i;
const PRODUCT_LINK = /^https?:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?([/?#][^\s]*)?$/i;
const DRAFT_KEY = 'xr:apply:two-step:v1';
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export function mountApply(root: HTMLElement) {
  const listeners = new AbortController(), options = { signal: listeners.signal };
  const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const form = find<HTMLFormElement>('[data-apply-form]');
  const basics = find<HTMLElement>('[data-step="basics"]');
  const details = find<HTMLElement>('[data-step="details"]');
  const teamFields = find<HTMLFieldSetElement>('[data-team-fields]');
  const fundingFields = find<HTMLFieldSetElement>('[data-funding-fields]');
  const error = find<HTMLElement>('[data-form-error]');
  const applicationChoices = find<HTMLFieldSetElement>('.apply__choices');
  const applicationError = find<HTMLElement>('[data-application-error]');
  const rows = find<HTMLElement>('[data-budget-rows]');
  const memberFields = find<HTMLFieldSetElement>('[data-members-field]');
  const memberRows = find<HTMLElement>('[data-member-rows]');
  const submitButton = find<HTMLButtonElement>('[data-submit]');
  const submitLabel = find<HTMLElement>('[data-submit-label]');
  const value = (name: string) => (form.elements.namedItem(name) as Field | RadioNodeList | null)?.value?.trim() ?? '';
  const field = (name: string) => form.elements.namedItem(name) as Field;
  let step = 1, submitting = false, completed = false;
  const place = () => root.style.setProperty('--apply-top', `${Math.max(122, (document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 80) + (innerHeight < 720 ? 34 : 44))}px`);
  place();
  addEventListener('resize', place, options);
  const background = mountApplyBackground(root);

  const budgetItems = () => [...rows.querySelectorAll<HTMLElement>('.apply__budget-row')].map(row => ({
    name: row.querySelector<HTMLInputElement>('[name="budget_name"]')!.value.trim(),
    cost: Number(row.querySelector<HTMLInputElement>('[name="budget_cost"]')!.value),
    priority: 'must' as const,
    link: row.querySelector<HTMLInputElement>('[name="budget_link"]')!.value.trim(),
  }));
  const total = () => budgetItems().reduce((sum, item) => sum + Math.round((Number.isFinite(item.cost) ? item.cost : 0) * 100), 0) / 100;
  const cap = () => value('funding_mode') === 'team' ? 1000 : 400;
  const updateBudget = () => {
    const amount = total();
    find<HTMLElement>('[data-budget-total]').textContent = money(amount);
    find<HTMLElement>('[data-budget-limit]').textContent = `Up to ${money(cap())} for a ${value('funding_mode') === 'team' ? 'team' : 'solo'} project.`;
    const budgetError = find<HTMLElement>('[data-budget-error]');
    budgetError.hidden = amount <= cap();
    budgetError.textContent = `Reduce your request to ${money(cap())} or less.`;
    find<HTMLButtonElement>('[data-add-item]').disabled = rows.children.length >= 40;
    rows.querySelectorAll<HTMLButtonElement>('[data-remove-item]').forEach(button => { button.disabled = rows.children.length === 1; });
  };
  const updateMode = () => {
    const team = value('funding_mode') === 'team';
    memberFields.hidden = !team;
    memberFields.disabled = !team;
    updateBudget();
  };
  const addRow = (item?: { name?: string; cost?: number; link?: string }) => {
    if (rows.children.length >= 40) return;
    const fragment = find<HTMLTemplateElement>('[data-budget-template]').content.cloneNode(true) as DocumentFragment;
    const name = fragment.querySelector<HTMLInputElement>('[name="budget_name"]')!;
    const cost = fragment.querySelector<HTMLInputElement>('[name="budget_cost"]')!;
    name.value = typeof item?.name === 'string' ? item.name.slice(0, 200) : '';
    cost.value = typeof item?.cost === 'number' && Number.isFinite(item.cost) ? String(item.cost) : '';
    fragment.querySelector<HTMLInputElement>('[name="budget_link"]')!.value = typeof item?.link === 'string' ? item.link.slice(0, 1000) : '';
    rows.append(fragment);
    updateBudget();
  };
  const members = () => [...memberRows.querySelectorAll<HTMLElement>('.apply__member-row')].map(row => ({
    name: row.querySelector<HTMLInputElement>('[name="member_name"]')!.value.trim(),
    detail: row.querySelector<HTMLInputElement>('[name="member_email"]')!.value.trim().toLowerCase(),
  }));
  const updateMembers = () => {
    find<HTMLButtonElement>('[data-add-member]').disabled = memberRows.children.length >= 20;
    memberRows.querySelectorAll<HTMLButtonElement>('[data-remove-member]').forEach(button => { button.disabled = memberRows.children.length === 1; });
  };
  const addMember = (member?: { name?: string; detail?: string }) => {
    if (memberRows.children.length >= 20) return;
    const fragment = find<HTMLTemplateElement>('[data-member-template]').content.cloneNode(true) as DocumentFragment;
    fragment.querySelector<HTMLInputElement>('[name="member_name"]')!.value = typeof member?.name === 'string' ? member.name.slice(0, 200) : '';
    fragment.querySelector<HTMLInputElement>('[name="member_email"]')!.value = typeof member?.detail === 'string' ? member.detail.slice(0, 320) : '';
    memberRows.append(fragment);
    updateMembers();
  };

  // A saved draft always opens at the first step. Only Continue moves to the form.
  const fields = () => [...form.querySelectorAll<Field>('input, textarea, select')];
  const save = () => {
    if (completed) return;
    const entries = fields().filter(input => !['website', 'budget_name', 'budget_cost', 'budget_link', 'member_name', 'member_email'].includes(input.name)).map(input => ({
      name: input.name, value: input.value,
      checked: input instanceof HTMLInputElement ? input.checked : undefined,
      project: input.closest<HTMLElement>('[data-project-tools]')?.dataset.projectTools,
    }));
    const budget = budgetItems().map((item, index) => ({ ...item,
      cost: rows.children[index].querySelector<HTMLInputElement>('[name="budget_cost"]')!.value === '' ? null : item.cost,
    }));
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ entries, budget, members: members() })); } catch { /* Storage can be unavailable. */ }
  };
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (draft && Array.isArray(draft.entries)) {
      // Match fields by name and project so layout changes do not discard saved answers.
      const inputs = fields().filter(input => !['website', 'budget_name', 'budget_cost', 'budget_link', 'member_name', 'member_email'].includes(input.name));
      const savedProject = draft.entries.find((entry: { name?: string; checked?: boolean } | null) => entry?.name === 'application' && entry.checked)?.value;
      inputs.forEach(input => {
        const project = input.closest<HTMLElement>('[data-project-tools]')?.dataset.projectTools;
        const entries = draft.entries.filter((entry: { name?: string; value?: string; project?: string } | null) => entry && entry.name === input.name && typeof entry.value === 'string' && (entry.project ? entry.project === project : !project || project === savedProject));
        if (input instanceof HTMLInputElement && ['radio', 'checkbox'].includes(input.type)) {
          if (entries.length) input.checked = entries.some((entry: { value: string; checked?: boolean }) => input.value === entry.value && (entry.checked === true || (entries.length === 1 && entry.checked === undefined)));
        } else if (entries.length) input.value = entries[0].value.slice(0, 'maxLength' in input && input.maxLength > 0 ? input.maxLength : 20000);
      });
      if (Array.isArray(draft.budget)) draft.budget.slice(0, 40).forEach((item: { name?: string; cost?: number; link?: string }) => addRow(item));
      if (Array.isArray(draft.members)) draft.members.slice(0, 20).forEach((member: { name?: string; detail?: string }) => addMember(member));
      else {
        const oldMembers = draft.entries.find((entry: { name?: string } | null) => entry?.name === 'members')?.value;
        if (typeof oldMembers === 'string') oldMembers.split(/\n/).map(line => line.trim()).filter(Boolean).slice(0, 20).forEach(line => {
          const email = line.match(/[^\s,<>()]+@(?:terpmail\.)?umd\.edu/i)?.[0] ?? '';
          addMember({ name: (email ? line.replace(email, '').replace(/^[\s,;()<>]+|[\s,;()<>]+$/g, '') : line), detail: email });
        });
      }
    } else {
      const old = JSON.parse(localStorage.getItem('xr:apply:basics') || '{}');
      for (const name of ['full_name', 'email', 'discord_username', 'major', 'year']) {
        if (typeof old[name] === 'string') field(name).value = old[name];
      }
    }
  } catch { /* Ignore an invalid or unavailable draft. */ }
  if (!rows.children.length) addRow();
  if (!memberRows.children.length) addMember();
  if (!value('funding_mode')) (form.querySelector('[name="funding_mode"][value="solo"]') as HTMLInputElement).checked = true;
  updateMode();

  const prepareDetails = () => {
    const funding = value('application') === 'funding';
    const team = teams.find(item => item.slug === value('application'));
    if (!funding && !team) return false;
    find<HTMLElement>('[data-details-title]').textContent = funding ? 'Apply for funding' : team!.name;
    teamFields.hidden = funding; teamFields.disabled = funding;
    fundingFields.hidden = !funding; fundingFields.disabled = !funding;
    find<HTMLElement>('[data-funding-info]').hidden = !funding;
    root.querySelectorAll<HTMLElement>('[data-project-info]').forEach(info => { info.hidden = funding || info.dataset.projectInfo !== team?.slug; });
    root.querySelectorAll<HTMLElement>('[data-project-media]').forEach(media => { media.hidden = funding || media.dataset.projectMedia !== team?.slug; });
    root.querySelectorAll<HTMLElement>('[data-project-tools]').forEach(group => {
      group.hidden = funding || group.dataset.projectTools !== team?.slug;
      group.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.disabled = group.hidden; });
    });
    if (team) {
      find<HTMLElement>('[data-project-question]').textContent = team.question;
      find<HTMLElement>('[data-meeting]').textContent = team.meeting;
      find<HTMLElement>('[data-project-details-title]').textContent = team.name;
    }
    root.querySelectorAll<HTMLElement>('[data-project-description]').forEach(description => { description.hidden = funding || description.dataset.projectDescription !== team?.slug; });
    updateMode();
    return true;
  };
  const showStep = (next: 1 | 2) => {
    step = next;
    basics.hidden = next !== 1;
    details.hidden = next !== 2;
    error.hidden = true;
    find<HTMLElement>('.apply__content').scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'instant' });
    (next === 1 ? basics : details).querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  };
  const validate = (section: HTMLElement) => {
    let first: Field | undefined;
    if (section === basics) {
      applicationError.hidden = !!value('application');
      if (applicationError.hidden) {
        applicationChoices.removeAttribute('aria-invalid');
        applicationChoices.removeAttribute('aria-describedby');
      } else {
        applicationChoices.setAttribute('aria-invalid', 'true');
        applicationChoices.setAttribute('aria-describedby', 'application-error');
      }
    }
    section.querySelectorAll<Field>('input, select, textarea').forEach(input => {
      if (!input.willValidate) return;
      input.setCustomValidity('');
      if (input.required && input.type !== 'checkbox' && input.type !== 'radio' && !input.value.trim()) input.setCustomValidity('Complete this field.');
      if (['email', 'member_email'].includes(input.name) && input.value && !UMD_EMAIL.test(input.value.trim())) input.setCustomValidity('Use an umd.edu or terpmail.umd.edu email.');
      if (input.name === 'budget_link' && input.value) {
        try {
          const url = new URL(input.value.trim());
          if (!PRODUCT_LINK.test(input.value.trim()) || !url.hostname || url.username || url.password) throw new Error('Invalid product link');
        } catch { input.setCustomValidity('Enter a product link starting with https:// or http://.'); }
      }
      if (!input.checkValidity()) { input.setAttribute('aria-invalid', 'true'); first ??= input; }
      else input.removeAttribute('aria-invalid');
    });
    if (first) {
      if (first.name === 'application') {
        applicationChoices.focus({ preventScroll: true });
        applicationChoices.scrollIntoView({ block: 'nearest' });
        return false;
      }
      first.focus();
      first.reportValidity();
      return false;
    }
    return true;
  };
  find<HTMLButtonElement>('[data-continue]').addEventListener('click', () => {
    if (validate(basics) && prepareDetails()) { save(); showStep(2); }
  }, options);
  find<HTMLButtonElement>('[data-back]').addEventListener('click', () => { if (!submitting) showStep(1); }, options);
  const rulesDialog = find<HTMLDialogElement>('[data-rules-dialog]');
  const rulesButton = find<HTMLButtonElement>('[data-open-rules]');
  rulesButton.addEventListener('click', () => { rulesDialog.showModal(); find<HTMLElement>('.apply__rules-body').scrollTop = 0; }, options);
  rulesDialog.querySelectorAll<HTMLButtonElement>('[data-close-rules]').forEach(button => button.addEventListener('click', () => rulesDialog.close(), options));
  rulesDialog.addEventListener('close', () => rulesButton.focus({ preventScroll: true }), options);
  const projectDialog = find<HTMLDialogElement>('[data-project-details-dialog]');
  let projectDetailsTrigger: HTMLButtonElement | undefined;
  root.querySelectorAll<HTMLButtonElement>('[data-open-project-details]').forEach(button => button.addEventListener('click', () => {
    projectDetailsTrigger = button;
    projectDialog.showModal();
    find<HTMLElement>('[data-project-details-body]').scrollTop = 0;
  }, options));
  projectDialog.querySelectorAll<HTMLButtonElement>('[data-close-project-details]').forEach(button => button.addEventListener('click', () => projectDialog.close(), options));
  projectDialog.addEventListener('close', () => projectDetailsTrigger?.focus({ preventScroll: true }), options);
  // Enter in a text field must not advance or submit implicitly. Focused buttons remain keyboard accessible.
  form.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault();
  }, options);
  form.addEventListener('input', event => {
    const input = event.target;
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) {
      input.setCustomValidity(''); input.removeAttribute('aria-invalid');
      if (input.name === 'application') {
        applicationError.hidden = true;
        applicationChoices.removeAttribute('aria-invalid');
        applicationChoices.removeAttribute('aria-describedby');
        applicationChoices.querySelectorAll<HTMLInputElement>('[name="application"]').forEach(choice => choice.removeAttribute('aria-invalid'));
      }
    }
    updateBudget(); save();
  }, options);
  form.addEventListener('change', () => { updateMode(); save(); }, options);
  find<HTMLButtonElement>('[data-add-item]').addEventListener('click', () => {
    addRow(); rows.lastElementChild?.querySelector<HTMLInputElement>('input')?.focus(); save();
  }, options);
  find<HTMLButtonElement>('[data-add-member]').addEventListener('click', () => {
    addMember(); memberRows.lastElementChild?.querySelector<HTMLInputElement>('input')?.focus(); save();
  }, options);
  memberRows.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest('[data-remove-member]');
    if (!button || memberRows.children.length <= 1) return;
    button.closest('.apply__member-row')?.remove();
    updateMembers(); save(); find<HTMLButtonElement>('[data-add-member]').focus();
  }, options);
  rows.addEventListener('click', event => {
    const stepper = (event.target as Element).closest<HTMLButtonElement>('[data-cost-step]');
    if (stepper) {
      const input = stepper.closest('.apply__budget-row')!.querySelector<HTMLInputElement>('[name="budget_cost"]')!;
      if (stepper.dataset.costStep === 'up') input.stepUp();
      else input.stepDown();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const button = (event.target as HTMLElement).closest('[data-remove-item]');
    if (!button || rows.children.length <= 1) return;
    button.closest('.apply__budget-row')?.remove();
    updateBudget(); save(); find<HTMLButtonElement>('[data-add-item]').focus();
  }, options);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (step !== 2 || submitting || completed) return;
    if (!validate(basics)) { showStep(1); validate(basics); return; }
    if (!validate(details)) return;
    const funding = value('application') === 'funding';
    const team = teams.find(item => item.slug === value('application'));
    if (!funding && !team) { showStep(1); return; }
    if (funding && value('funding_mode') === 'team' && (members().length < 1 || members().length > 20)) {
      error.textContent = 'Add 1 to 20 team members.';
      error.hidden = false; find<HTMLButtonElement>('[data-add-member]').focus(); return;
    }
    if (funding && (total() <= 0 || total() > cap())) {
      error.textContent = `Enter a budget between $0.01 and ${money(cap())}.`;
      error.hidden = false; rows.querySelector<HTMLInputElement>('[name="budget_cost"]')?.focus(); return;
    }
    submitting = true; error.hidden = true; submitButton.disabled = true;
    find<HTMLButtonElement>('[data-back]').disabled = true;
    submitLabel.textContent = 'Submitting';
    form.setAttribute('aria-busy', 'true');
    try {
      if (!value('website')) {
        const { supabase } = await import('../../lib/supabase');
        if (funding) {
          const { error: failure } = await supabase.from('funding_pitches').insert({
            project_title: value('project_title'), idea: value('idea'), motivation: value('motivation'), topic: null,
            lead_name: value('full_name'), lead_email: value('email').toLowerCase(), lead_discord: value('discord_username'),
            lead_major: value('major'), lead_year: value('year'), funding_mode: value('funding_mode') === 'team' ? 'team' : 'solo',
            members: value('funding_mode') === 'team' ? members() : [],
            outline: null, zero_dollar_plan: null, timeline: null, deliverable: null, lab_equipment: null,
            budget_items: budgetItems(), requested_total: total(), agreed_to_rules: (field('agreed_to_rules') as HTMLInputElement).checked,
          });
          if (failure) throw failure;
        } else {
          const { error: failure } = await supabase.from('team_applications').insert({
            team: team!.slug, full_name: value('full_name'), email: value('email').toLowerCase(), discord_username: value('discord_username'),
            year: value('year'), major: value('major'), pitch: value('pitch'),
            tools: [...form.querySelectorAll<HTMLInputElement>('[name="tools"]:checked')].filter(input => !input.disabled).map(input => input.value),
            link: value('link') || null, availability: value('availability'), anything_else: null,
          });
          if (failure) throw failure;
        }
      }
      if (listeners.signal.aborted) return;
      completed = true;
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* Ignore unavailable storage. */ }
      form.hidden = true;
      find<HTMLElement>('[data-done]').hidden = false;
      window.scrollTo({ top: 0, behavior: 'instant' });
      find<HTMLElement>('#done-title').focus({ preventScroll: true });
    } catch {
      if (listeners.signal.aborted) return;
      error.textContent = 'Your application could not be submitted. Your answers are still here. Please try again.';
      error.hidden = false;
      error.scrollIntoView({ block: 'nearest' });
    } finally {
      submitting = false; submitButton.disabled = false;
      find<HTMLButtonElement>('[data-back]').disabled = false;
      submitLabel.textContent = 'Submit application'; form.removeAttribute('aria-busy');
    }
  }, options);

  void (async () => {
    await Promise.race([background.ready, new Promise(resolve => setTimeout(resolve, 1500))]);
    if (!listeners.signal.aborted && window.xrSuitsHeld?.()) await window.xrSuitsReveal?.(() => undefined);
  })();
  return () => { listeners.abort(); background.dispose(); };
}
