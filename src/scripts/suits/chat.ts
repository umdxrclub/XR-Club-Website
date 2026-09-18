// Discord chat panel: reads the team channel through the bot and sends as the
// member through the channel webhook.
import { db, api, state, isLead } from './api';
import { esc, toast } from './ui';

interface Msg {
  id: string;
  author: string;
  avatar: string | null;
  bot: boolean;
  content: string;
  timestamp: string;
  attachments: Array<{ url: string; name: string }>;
}

let timer = 0;
let lastId = '';

export function stop() {
  window.clearInterval(timer);
  timer = 0;
}

export async function render(host: HTMLElement) {
  stop();
  host.innerHTML = `<p class="st-muted">Checking the Discord connection.</p>`;
  let status: { webhook: boolean; bot: boolean; channelName: string | null };
  try {
    status = await api.discord('status');
  } catch (err) {
    host.innerHTML = `<div class="st-section"><h2 class="st-h1">Discord</h2><p class="st-notice st-notice--danger">${esc((err as Error).message)}</p></div>`;
    return;
  }

  const me = state.me!;
  const connected = !!me.discord_id;

  if (!status.bot || !status.webhook) {
    host.innerHTML = `
      <div class="st-section">
        <h2 class="st-h1">Discord</h2>
        <p class="st-lead">The team channel is not connected yet.${isLead() ? ' Three things to set up, about ten minutes.' : ' The team lead is setting it up.'}</p>
        ${isLead() ? `
        <ol class="st-steps">
          <li class="st-step"><span class="st-step__num">1</span><div><h4 class="st-step__title">A channel and a webhook ${status.webhook ? '(done)' : ''}</h4><p class="st-step__text">In the XR Club Discord server, make a private channel for the SUITS team. Open its settings, choose Integrations, then Webhooks, create one named SUITS Team, and copy the webhook URL. The dashboard posts meetings, polls, announcements, and chat messages through it.</p></div></li>
          <li class="st-step"><span class="st-step__num">2</span><div><h4 class="st-step__title">A bot that can read the channel ${status.bot ? '(done)' : ''}</h4><p class="st-step__text">At discord.com/developers create an application, add a Bot, copy its token, and turn on the Message Content intent. Invite it to the server with the View Channel and Read Message History permissions, then give it access to the team channel. In Discord, turn on Developer Mode, right click the channel, and Copy Channel ID.</p></div></li>
          <li class="st-step"><span class="st-step__num">3</span><div><h4 class="st-step__title">Save the three values</h4><p class="st-step__text">From the project folder run: npx supabase secrets set SUITS_DISCORD_WEBHOOK_URL=... SUITS_DISCORD_BOT_TOKEN=... SUITS_DISCORD_CHANNEL_ID=... then reload this page. Nothing else changes.</p></div></li>
        </ol>` : ''}
      </div>`;
    return;
  }

  host.innerHTML = `
    <div class="st-section">
      <div class="st-toolbar">
        <div><h2 class="st-h1">Discord</h2><p class="st-lead" style="margin:0;">The team channel${status.channelName ? `, #${esc(status.channelName)}` : ''}, right here. Messages you send show up in Discord as you.</p></div>
        ${connected ? `<span class="st-pill st-pill--ok">Discord connected as ${esc(me.discord_username || 'you')}</span>` : `<button type="button" class="st-btn st-btn--small" id="st-connect-discord">Connect Discord account</button>`}
      </div>
      ${connected ? '' : `<p class="st-help">Until you connect Discord, messages you send from here appear under your name from Google.</p>`}
      <div class="st-chat">
        <div class="st-chat__head"><span id="st-chat-status" class="st-muted">Loading messages.</span><button type="button" class="st-btn st-btn--small" id="st-chat-refresh">Refresh</button></div>
        <div class="st-chat__feed" id="st-chat-feed"></div>
        <form class="st-chat__compose" id="st-chat-form" novalidate>
          <input class="st-input" name="content" maxlength="1900" placeholder="Message the team" autocomplete="off" />
          <button type="submit" class="st-btn st-btn--primary">Send</button>
        </form>
      </div>
    </div>`;

  const feed = host.querySelector<HTMLElement>('#st-chat-feed')!;
  const statusEl = host.querySelector<HTMLElement>('#st-chat-status')!;

  const load = async () => {
    try {
      const { messages } = await api.discord<{ messages: Msg[] }>('messages');
      const newest = messages[messages.length - 1]?.id || '';
      if (newest !== lastId) {
        const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
        feed.innerHTML = messages.length ? messages.map(m => `
          <div class="st-msg">
            ${m.avatar ? `<img class="st-msg__avatar" src="${esc(m.avatar)}" alt="" />` : `<span class="st-msg__avatar"></span>`}
            <div>
              <div class="st-msg__head"><span class="st-msg__author">${esc(m.author)}</span>${m.bot ? ' · bot' : ''} · ${esc(new Date(m.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</div>
              <p class="st-msg__body">${linkify(m.content)}</p>
              ${m.attachments.map(a => `<a class="st-link" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name)}</a>`).join(' ')}
            </div>
          </div>`).join('') : `<p class="st-muted">No messages yet. Say hello.</p>`;
        if (atBottom || !lastId) feed.scrollTop = feed.scrollHeight;
        lastId = newest;
      }
      statusEl.textContent = `Updated ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    } catch (err) {
      statusEl.textContent = (err as Error).message;
    }
  };

  lastId = '';
  await load();
  timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 8000);

  host.querySelector('#st-chat-refresh')!.addEventListener('click', () => { lastId = ''; void load(); });

  const form = host.querySelector<HTMLFormElement>('#st-chat-form')!;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const inputEl = form.elements.namedItem('content') as HTMLInputElement;
    const content = inputEl.value.trim();
    if (!content) return;
    inputEl.disabled = true;
    try {
      await api.discord('send', { content });
      inputEl.value = '';
      lastId = '';
      setTimeout(load, 800);
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      inputEl.disabled = false;
      inputEl.focus();
    }
  });

  host.querySelector('#st-connect-discord')?.addEventListener('click', async () => {
    const { error } = await db.auth.linkIdentity({ provider: 'discord', options: { redirectTo: `${location.origin}${state.base}suits/team#chat` } });
    if (error) toast(`Could not start Discord sign in: ${error.message}`, 'danger');
  });
}

function linkify(s: string) {
  return esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}
