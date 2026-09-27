// Small helpers shared by the dashboard views.

export function esc(s: string | null | undefined) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Date(iso).toLocaleDateString(undefined, opts);
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function fmtDateTime(iso: string) {
  return `${fmtDate(iso)} at ${fmtTime(iso)}`;
}

export function fmtRelative(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 86400000;
  const days = Math.round(diff);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 0) return `in ${days} days`;
  return `${-days} days ago`;
}

/** Hour label like "9 AM" or "1 PM". */
export function hourLabel(h: number) {
  return `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Local date key YYYY-MM-DD. */
export function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function initials(name: string) {
  return name.split(/\s+/).map(p => p[0] || '').join('').slice(0, 2).toUpperCase();
}

export function avatarHtml(name: string, url: string | null | undefined, cls = 'st-avatar') {
  if (url) return `<img class="${cls}" src="${esc(url)}" alt="" referrerpolicy="no-referrer" />`;
  return `<span class="${cls}" style="display:inline-flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;">${esc(initials(name))}</span>`;
}

let toastTimer = 0;
export function toast(message: string, kind: 'ok' | 'danger' = 'ok') {
  let el = document.getElementById('st-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'st-toast';
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:60;padding:0.8rem 1.2rem;border-radius:12px;font-size:0.95rem;font-weight:600;max-width:90vw;transition:opacity 200ms ease;';
    document.body.appendChild(el);
  }
  el.style.background = kind === 'ok' ? 'var(--ink, #1d1d1f)' : 'var(--danger, #d70015)';
  el.style.color = kind === 'ok' ? 'var(--surface, #fff)' : '#fff';
  el.textContent = message;
  el.style.opacity = '1';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el!.style.opacity = '0'; }, 2600);
}

export interface ModalOptions {
  title: string;
  body: string;
  className?: string;
  submitLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onSubmit?: (form: HTMLFormElement, close: () => void) => Promise<void> | void;
}

export function onboardingProgress(step: 1 | 2) {
  return `<ol class="st-onboarding-steps" aria-label="Setup progress"><li${step===1?' aria-current="step"':''}>1. Avatar</li><li${step===2?' aria-current="step"':''}>2. Layout</li></ol>`;
}

/** Opens a modal with a form. Resolves when it closes. */
export function openModal(opts: ModalOptions): Promise<void> {
  const host = document.getElementById('st-modal-host')!;
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const modalTitleId = 'st-modal-' + crypto.randomUUID();
    let submitting = false;
    wrap.className = 'st-modal';
    if(opts.className)wrap.classList.add(opts.className);
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', modalTitleId);
    wrap.innerHTML = `
      <form class="st-modal__card" novalidate>
        <h2 class="st-modal__title" id="${modalTitleId}">${esc(opts.title)}</h2>
        <div class="st-modal__body">${opts.body}
        <p class="st-notice st-notice--danger" data-modal-error hidden style="margin-top:1rem;"></p></div>
        <div class="st-modal__actions">
          <button type="button" class="st-btn" data-modal-cancel>${esc(opts.cancelLabel || 'Cancel')}</button>
          ${opts.onSubmit ? `<button type="submit" class="st-btn ${opts.danger ? 'st-btn--danger' : 'st-btn--primary'}">${esc(opts.submitLabel || 'Save')}</button>` : ''}
        </div>
      </form>`;
    const form = wrap.querySelector('form') as HTMLFormElement;
    const error = wrap.querySelector('[data-modal-error]') as HTMLElement;
    enhanceSelects(form);
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); previouslyFocused?.focus(); resolve(); };
    const onKey = (e: KeyboardEvent) => {
      if(document.querySelector('.st-dd__list,.st-datepick__pop'))return;
      if (e.key === 'Escape' && !submitting) close();
      if (e.key !== 'Tab') return;
      const controls = [...form.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea, select, summary, a[href], [tabindex="0"]')].filter(el => el.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', e => { if (e.target === wrap && !submitting) close(); });
    wrap.querySelector('[data-modal-cancel]')!.addEventListener('click', close);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!opts.onSubmit || submitting) return;
      submitting = true;
      const cancel = form.querySelector<HTMLButtonElement>('[data-modal-cancel]')!;
      cancel.disabled = true;
      const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      submit.disabled = true;
      error.hidden = true;
      try {
        await opts.onSubmit(form, close);
      } catch (err) {
        error.textContent = (err as Error).message;
        error.hidden = false;
        submit.disabled = false;
        submitting = false;
        cancel.disabled = false;
      }
    });
    host.appendChild(wrap);
    (form.querySelector('input:not([type=hidden]), textarea, button') as HTMLElement | null)?.focus();
  });
}

export function confirmModal(title: string, text: string, submitLabel: string) {
  return new Promise<boolean>(resolve => {
    let ok = false;
    openModal({
      title,
      body: `<p class="st-p">${esc(text)}</p>`,
      submitLabel,
      danger: true,
      onSubmit: (_f, close) => { ok = true; close(); },
    }).then(() => resolve(ok));
  });
}

export function field(name: string, label: string, control: string, help = '') {
  return `<div class="st-field"><label class="st-label" for="f-${name}">${esc(label)}</label>${help ? `<p class="st-help">${esc(help)}</p>` : ''}${control}</div>`;
}

export function input(name: string, attrs = '') {
  return `<input class="st-input" id="f-${name}" name="${name}" ${attrs} />`;
}

export function textarea(name: string, attrs = '') {
  return `<textarea class="st-textarea" id="f-${name}" name="${name}" ${attrs}></textarea>`;
}

export function select(name: string, options: Array<{ value: string; label: string; selected?: boolean }>, attrs = '') {
  return `<select class="st-select" id="f-${name}" name="${name}" ${attrs}>${options.map(o => `<option value="${esc(o.value)}"${o.selected ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
}

/**
 * Replace every native select under `root` with a dropdown drawn in the
 * dashboard's own style. The native select stays in the form (hidden) so
 * values and change events keep working.
 */
export function enhanceSelects(root: ParentNode) {
  root.querySelectorAll<HTMLSelectElement>('select.st-select:not([data-enhanced])').forEach(sel => {
    sel.dataset.enhanced = '1';
    const wrap = document.createElement('div');
    wrap.className = `st-dd${sel.classList.contains('st-select--inline') ? ' st-dd--inline' : ''}`;
    sel.parentNode!.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('st-dd__native');
    sel.tabIndex = -1;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'st-dd__btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    const draw = () => { btn.innerHTML = `<span class="st-dd__label">${esc(sel.selectedOptions[0]?.textContent || '')}</span><span class="st-dd__chev" aria-hidden="true"></span>`; };
    draw();
    wrap.appendChild(btn);
    sel.addEventListener('change', draw);

    btn.addEventListener('click', () => {
      document.querySelector('.st-dd__list')?.remove();
      const host = document.getElementById('st') || document.body;
      const list = document.createElement('div');
      list.className = 'st-menu st-dd__list';
      list.setAttribute('role', 'listbox');
      list.innerHTML = Array.from(sel.options).map(o => `<button type="button" role="option" data-value="${esc(o.value)}" class="${o.selected ? 'is-selected' : ''}"${o.disabled ? ' disabled' : ''}>${esc(o.textContent || '')}</button>`).join('');
      host.appendChild(list);
      const r = btn.getBoundingClientRect();
      const w = Math.min(window.innerWidth-16,Math.max(list.offsetWidth, r.width));
      list.style.minWidth = `${w}px`;
      const below = window.innerHeight - r.bottom;
      const h = list.offsetHeight;
      const proposed = below < h + 12 ? r.top - h - 6 : r.bottom + 6;
      const top = Math.max(8,Math.min(window.innerHeight-h-8,proposed));
      list.style.top = `${top}px`;
      list.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left))}px`;
      const close = () => { list.remove(); document.removeEventListener('click', onDoc, true); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', close); };
      const onScroll = (e: Event) => { if (!list.contains(e.target as Node)) close(); };
      const onDoc = (e: Event) => { if (!list.contains(e.target as Node) && e.target !== btn) close(); };
      const onKey = (e: KeyboardEvent) => {
        const items = Array.from(list.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'Escape') { close(); btn.focus(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0])?.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1])?.focus(); }
      };
      setTimeout(() => { document.addEventListener('click', onDoc, true); document.addEventListener('keydown', onKey); window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', close); }, 0);
      const selected = list.querySelector<HTMLButtonElement>('.is-selected') || list.querySelector<HTMLButtonElement>('button');
      selected?.focus({ preventScroll: true });
      if (selected) list.scrollTop = selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2;
      list.addEventListener('click', e => {
        const opt = (e.target as HTMLElement).closest<HTMLElement>('[data-value]');
        if (!opt) return;
        close();
        if (sel.value !== opt.dataset.value) {
          sel.value = opt.dataset.value!;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        draw();
        btn.focus();
      });
    });
  });
}

export function formValue(form: HTMLFormElement, name: string) {
  return ((form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '').trim();
}

export function formChecked(form: HTMLFormElement, name: string) {
  return !!(form.elements.namedItem(name) as HTMLInputElement | null)?.checked;
}

export function pill(text: string, kind: '' | 'ink' | 'ok' | 'warn' | 'red' = '') {
  return `<span class="st-pill${kind ? ` st-pill--${kind}` : ''}">${esc(text)}</span>`;
}

export function roleLabel(role: string) {
  return role === 'lead' ? 'Team lead' : role === 'product_manager' ? 'Product manager' : 'Member';
}
