// Who the Discord bot pings for a task or meeting: a row of chips in the form.
// The choice is kept in a hidden input, comma separated, and read with formValue('ping').
import { state } from './api';
import { esc } from './ui';
import { READER_ROLES } from './reader-content';

export type PingList = string[];

const GROUPS: Array<{ value: string; label: string }> = [
  { value: 'everyone', label: 'Everyone' },
  ...READER_ROLES.map(r => ({ value: `role:${r.key}`, label: r.name })),
];

/** The chips: Everyone, or any mix of the six role groups. A task's owner is always pinged. */
export function pingPicker(selected: PingList, opts: { owner?: boolean } = {}) {
  const chosen = new Set(selected);
  const chips = GROUPS;
  return `
    <div class="st-field">
      <span class="st-label">Ping on Discord${opts.owner ? ' (the owner always is)' : ''}</span>
      <div class="st-pings" data-pings>
        <input type="hidden" name="ping" value="${esc(selected.join(','))}" />
        ${chips.map(c => `<button type="button" class="st-chip st-chip--small${chosen.has(c.value) ? ' is-active' : ''}" data-ping="${esc(c.value)}">${esc(c.label)}</button>`).join('')}
      </div>
    </div>`;
}

/** Wire the chips inside a form. Everyone and Nobody stand alone; anything else can be combined. */
export function bindPingPicker(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[data-pings]').forEach(box => {
    const hidden = box.querySelector<HTMLInputElement>('input[name="ping"]')!;
    box.addEventListener('click', e => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-ping]');
      if (!chip) return;
      const value = chip.dataset.ping!;
      let list: PingList = parsePing(hidden.value);
      if (list.includes(value)) list = list.filter(v => v !== value);
      else if (value === 'everyone') list = [value];
      else list = [...list.filter(v => v !== 'everyone'), value];
      hidden.value = list.join(',');
      box.querySelectorAll<HTMLElement>('[data-ping]').forEach(c => c.classList.toggle('is-active', list.includes(c.dataset.ping!)));
    });
  });
}

export function parsePing(raw: string | null | undefined): PingList {
  return (raw || '').split(',').map(v => v.trim()).filter(Boolean);
}

/** "Everyone", "Owner and UI UX Design", "Kyle Goh and 2 more" */
export function pingSummary(list: PingList | null | undefined) {
  if (!list || !list.length) return '';
  const names = list.map(v => {
    if (v === 'everyone') return 'Everyone';
    if (v === 'owner') return 'Owner';
    if (v === 'none') return 'Nobody';
    if (v.startsWith('role:')) return READER_ROLES.find(r => r.key === v.slice(5))?.name || v.slice(5);
    if (v.startsWith('user:')) return state.members.find(m => m.user_id === v.slice(5))?.display_name || 'someone';
    return 'a Discord role';
  });
  if (names.length <= 2) return names.join(' and ');
  return `${names[0]} and ${names.length - 1} more`;
}
