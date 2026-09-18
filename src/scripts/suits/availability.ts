// Availability polls: managers open a poll for a set of days and hours, every
// member paints the hours they are free, and the grid shows where the team
// overlaps.
import { api, state, isManager, memberName, type Poll, type Availability } from './api';
import { esc, toast, openModal, confirmModal, field, input, textarea, formValue, hourLabel, dateKey, fmtDate, pill } from './ui';

let selectedPollId: string | null = null;

export async function render(host: HTMLElement) {
  host.innerHTML = `<p class="st-muted">Loading.</p>`;
  const polls = await api.polls();
  if (selectedPollId && !polls.some(p => p.id === selectedPollId)) selectedPollId = null;
  if (!selectedPollId) selectedPollId = polls.find(p => !p.closed)?.id ?? polls[0]?.id ?? null;

  host.innerHTML = `
    <div class="st-section">
      <div class="st-toolbar">
        <div><h2 class="st-h1">Availability</h2><p class="st-lead" style="margin:0;">Paint the hours you can make. The darker a cell, the more of the team is free then.</p></div>
        ${isManager() ? `<button type="button" class="st-btn st-btn--primary" id="st-new-poll">New poll</button>` : ''}
      </div>
      ${polls.length ? `<div class="st-toolbar__group" id="st-poll-list">${polls.map(p => `<button type="button" class="st-btn st-btn--small${p.id === selectedPollId ? ' st-btn--primary' : ''}" data-poll="${p.id}">${esc(p.title)}${p.closed ? ' (closed)' : ''}</button>`).join('')}</div>` : `<div class="st-empty">No polls yet.${isManager() ? ' Create one to find a meeting time.' : ' A product manager will open one when it is time to schedule.'}</div>`}
    </div>
    <div id="st-poll-detail"></div>`;

  host.querySelector('#st-new-poll')?.addEventListener('click', () => newPoll(host));
  host.querySelectorAll<HTMLElement>('[data-poll]').forEach(b => b.addEventListener('click', () => { selectedPollId = b.dataset.poll!; render(host); }));

  const poll = polls.find(p => p.id === selectedPollId);
  if (poll) await renderPoll(host.querySelector('#st-poll-detail')!, poll, host);
}

function newPoll(host: HTMLElement) {
  const today = dateKey(new Date());
  openModal({
    title: 'New availability poll',
    body: `
      ${field('title', 'Title', input('title', 'type="text" required placeholder="Weekly team meeting"'))}
      ${field('description', 'What is this for', textarea('description', 'rows="2" placeholder="Optional"'))}
      <div class="st-row">
        ${field('start', 'First day', input('start', `type="date" required value="${today}"`))}
        ${field('end', 'Last day', input('end', `type="date" required value="${today}"`))}
      </div>
      <div class="st-row">
        ${field('start_hour', 'From', hourSelect('start_hour', 9))}
        ${field('end_hour', 'Until', hourSelect('end_hour', 22))}
      </div>
      <p class="st-help">Up to 14 days. Hours are local time.</p>`,
    submitLabel: 'Create poll',
    onSubmit: async (form, close) => {
      const title = formValue(form, 'title');
      if (!title) throw new Error('Give the poll a title.');
      const start = new Date(formValue(form, 'start') + 'T12:00:00');
      const end = new Date(formValue(form, 'end') + 'T12:00:00');
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) throw new Error('Check the dates.');
      const days: string[] = [];
      for (let d = new Date(start); d <= end && days.length < 14; d.setDate(d.getDate() + 1)) days.push(dateKey(d));
      const startHour = Number(formValue(form, 'start_hour'));
      const endHour = Number(formValue(form, 'end_hour'));
      if (endHour <= startHour) throw new Error('The end hour must be after the start hour.');
      const poll = await api.createPoll({ title, description: formValue(form, 'description') || null, days, start_hour: startHour, end_hour: endHour });
      selectedPollId = poll.id;
      close();
      toast('Poll created.');
      try {
        await api.discord('announce', { text: `New availability poll: ${title}. ${days.length} day${days.length === 1 ? '' : 's'} starting ${fmtDate(days[0] + 'T12:00:00')}. Fill it in on the mission dashboard: ${location.origin}${state.base}suits/team#availability` });
      } catch (err) {
        toast(`Saved, but Discord was not notified: ${(err as Error).message}`, 'danger');
      }
      await render(host);
    },
  });
}

function hourSelect(name: string, selected: number) {
  const opts = [];
  for (let h = 6; h <= 23; h++) opts.push(`<option value="${h}"${h === selected ? ' selected' : ''}>${hourLabel(h)}</option>`);
  return `<select class="st-select" id="f-${name}" name="${name}">${opts.join('')}</select>`;
}

async function renderPoll(host: HTMLElement, poll: Poll, page: HTMLElement) {
  const rows = await api.availability(poll.id);
  const me = state.me!.user_id;
  const mine = new Set(rows.find(r => r.user_id === me)?.slots ?? []);
  const others = rows.filter(r => r.user_id !== me);
  const total = state.members.length;
  const hours: number[] = [];
  for (let h = poll.start_hour; h < poll.end_hour; h++) hours.push(h);

  const counts = new Map<string, string[]>();
  for (const r of rows) for (const s of r.slots) counts.set(s, [...(counts.get(s) ?? []), r.user_id]);

  // Heat shows teammates; your own hours are drawn separately
  const heat = (slot: string) => {
    const n = (counts.get(slot) ?? []).filter(id => id !== me).length;
    if (!n) return 0;
    return Math.max(1, Math.min(5, Math.ceil((n / Math.max(total - 1, 1)) * 5)));
  };

  const best = [...counts.entries()].filter(([, ids]) => ids.length >= 2).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, 5);
  const bestSet = new Set(best.filter(([, ids]) => ids.length === best[0]?.[1].length).map(([s]) => s));

  host.innerHTML = `
    <div class="st-card">
      <div class="st-toolbar">
        <div>
          <h3 class="st-h2" style="margin-bottom:0.2rem;">${esc(poll.title)} ${poll.closed ? pill('Closed') : pill('Open', 'ok')}</h3>
          <p class="st-muted" style="margin:0;">${esc(poll.description || '')}${poll.description ? ' · ' : ''}${rows.length} of ${total} responded${poll.created_by ? ` · opened by ${esc(memberName(poll.created_by))}` : ''}</p>
        </div>
        ${isManager() ? `<div class="st-toolbar__group">
          <button type="button" class="st-btn st-btn--small" id="st-poll-toggle">${poll.closed ? 'Reopen' : 'Close poll'}</button>
          <button type="button" class="st-btn st-btn--small st-btn--danger" id="st-poll-delete">Delete</button>
        </div>` : ''}
      </div>
      <div class="st-av">
        <div class="st-av__grid" id="st-av-grid" style="grid-template-columns: 66px repeat(${poll.days.length}, minmax(78px, 1fr));">
          <div class="st-av__corner"></div>
          ${poll.days.map(d => { const dt = new Date(d + 'T12:00:00'); return `<div class="st-av__day">${esc(dt.toLocaleDateString(undefined, { weekday: 'short' }))}<small>${esc(dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</small></div>`; }).join('')}
          ${hours.map(h => `<div class="st-av__hour">${esc(hourLabel(h))}</div>${poll.days.map(d => {
            const slot = `${d} ${String(h).padStart(2, '0')}:00`;
            return `<div class="st-av__cell${mine.has(slot) ? ' is-mine' : ''}${bestSet.has(slot) ? ' is-best' : ''}" data-slot="${slot}" data-heat="${heat(slot)}" role="button" tabindex="0" aria-label="${esc(fmtDate(d + 'T12:00:00'))} ${esc(hourLabel(h))}"></div>`;
          }).join('')}`).join('')}
        </div>
      </div>
      <div class="st-av__legend">
        <span><span class="st-av__swatch" style="background:var(--ink);"></span>Your hours</span>
        <span><span class="st-av__swatch" style="background:var(--accent);"></span>Teammates free, darker is more</span>
        <span id="st-av-status" class="st-muted">${poll.closed ? 'This poll is closed.' : 'Tap or drag to mark the hours you are free. Saves on its own.'}</span>
      </div>
      <p class="st-av__names" id="st-av-names"></p>
      ${best.length ? `<div style="margin-top:1rem;"><h4 class="st-h3">Best times so far</h4><ul class="st-list">${best.map(([slot, ids]) => `<li><strong>${esc(fmtDate(slot.slice(0, 10) + 'T12:00:00'))}, ${esc(hourLabel(Number(slot.slice(11, 13))))}</strong>: ${ids.length} of ${total}. ${esc(ids.map(id => memberName(id)).join(', '))}</li>`).join('')}</ul></div>` : ''}
    </div>`;

  // Painting
  const grid = host.querySelector<HTMLElement>('#st-av-grid')!;
  const status = host.querySelector<HTMLElement>('#st-av-status')!;
  const names = host.querySelector<HTMLElement>('#st-av-names')!;
  let painting: boolean | null = null;
  let saveTimer = 0;

  const setCell = (cell: HTMLElement, on: boolean) => {
    const slot = cell.dataset.slot!;
    if (on) mine.add(slot); else mine.delete(slot);
    cell.classList.toggle('is-mine', on);
  };
  const scheduleSave = () => {
    window.clearTimeout(saveTimer);
    status.textContent = 'Saving.';
    saveTimer = window.setTimeout(async () => {
      try {
        await api.saveAvailability(poll.id, [...mine].sort());
        status.textContent = 'Saved.';
      } catch (err) {
        status.textContent = `Not saved: ${(err as Error).message}`;
      }
    }, 600);
  };
  const showNames = (cell: HTMLElement) => {
    const ids = counts.get(cell.dataset.slot!) ?? [];
    const list = ids.map(id => memberName(id));
    if (mine.has(cell.dataset.slot!) && !ids.includes(me)) list.push('you');
    names.textContent = list.length ? `${cell.getAttribute('aria-label')}: ${list.join(', ')}` : `${cell.getAttribute('aria-label')}: nobody yet`;
  };

  if (!poll.closed) {
    grid.style.touchAction = 'none';
    grid.addEventListener('pointerdown', e => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.st-av__cell');
      if (!cell) return;
      e.preventDefault();
      painting = !mine.has(cell.dataset.slot!);
      setCell(cell, painting);
      scheduleSave();
      grid.setPointerCapture?.(e.pointerId);
    });
    grid.addEventListener('pointermove', e => {
      if (painting === null) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest<HTMLElement>('.st-av__cell');
      if (cell && cell.classList.contains('is-mine') !== painting) { setCell(cell, painting); scheduleSave(); }
    });
    const stop = () => { painting = null; };
    grid.addEventListener('pointerup', stop);
    grid.addEventListener('pointercancel', stop);
    grid.addEventListener('keydown', e => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.st-av__cell');
      if (cell && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setCell(cell, !mine.has(cell.dataset.slot!)); scheduleSave(); }
    });
  }
  grid.addEventListener('pointerover', e => { const cell = (e.target as HTMLElement).closest<HTMLElement>('.st-av__cell'); if (cell) showNames(cell); });
  grid.addEventListener('focusin', e => { const cell = (e.target as HTMLElement).closest<HTMLElement>('.st-av__cell'); if (cell) showNames(cell); });

  host.querySelector('#st-poll-toggle')?.addEventListener('click', async () => {
    await api.setPollClosed(poll.id, !poll.closed);
    await render(page);
  });
  host.querySelector('#st-poll-delete')?.addEventListener('click', async () => {
    if (!(await confirmModal('Delete this poll?', `"${poll.title}" and everyone's answers will be removed.`, 'Delete poll'))) return;
    await api.deletePoll(poll.id);
    selectedPollId = null;
    await render(page);
  });

  void (others as Availability[]);
}
