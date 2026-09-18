// Discord bridge for the NASA SUITS team dashboard (/suits/team).
//
// Every request carries the caller's Supabase session. The caller must be a
// signed in UMD account on the team. Actions:
//   status    what is configured (webhook, bot, channel) and the channel name
//   announce  post a message to the team channel as the bot (managers only)
//   messages  read the most recent messages in the team channel
//   send      post a message to the channel as the caller (name and avatar)
//
// Secrets:
//   SUITS_DISCORD_WEBHOOK_URL   webhook created in the team channel
//   SUITS_DISCORD_BOT_TOKEN     bot token, bot must be in the server with
//                               View Channel and Read Message History
//   SUITS_DISCORD_CHANNEL_ID    the team channel id
//
// Deploy: npx supabase functions deploy suits-discord --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEAM_EMAIL = /@(terpmail\.)?umd\.edu$/i;
const DISCORD_API = 'https://discord.com/api/v10';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not signed in' }, 401);

  // Who is calling
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user || !TEAM_EMAIL.test(user.email || '')) return json({ error: 'Not signed in with a UMD account' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: member } = await admin.from('suits_team').select('display_name, avatar_url, role, discord_username, discord_avatar').eq('user_id', user.id).single();
  if (!member) return json({ error: 'You are not on the team roster yet. Open the dashboard once to join.' }, 403);
  const isManager = member.role === 'product_manager' || member.role === 'lead';

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }

  const webhook = Deno.env.get('SUITS_DISCORD_WEBHOOK_URL');
  const botToken = Deno.env.get('SUITS_DISCORD_BOT_TOKEN');
  const channelId = Deno.env.get('SUITS_DISCORD_CHANNEL_ID');

  try {
    if (body.action === 'status') {
      let channelName: string | null = null;
      if (botToken && channelId) {
        const r = await fetch(`${DISCORD_API}/channels/${channelId}`, { headers: { Authorization: `Bot ${botToken}` } });
        if (r.ok) channelName = (await r.json()).name ?? null;
      }
      return json({ webhook: !!webhook, bot: !!(botToken && channelId), channelName, isManager });
    }

    if (body.action === 'announce') {
      if (!isManager) return json({ error: 'Only product managers and the lead can post announcements' }, 403);
      if (!webhook) return json({ error: 'The Discord webhook is not set up yet' }, 500);
      const text = String(body.text || '').trim();
      if (!text) return json({ error: 'Nothing to send' }, 400);
      const r = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text.slice(0, 1900), username: 'SUITS Team', allowed_mentions: { parse: ['everyone', 'users'] } }),
      });
      if (!r.ok) return json({ error: `Discord refused the announcement (${r.status})` }, 502);
      return json({ ok: true });
    }

    if (body.action === 'messages') {
      if (!botToken || !channelId) return json({ error: 'The Discord bot is not set up yet' }, 500);
      const limit = Math.min(100, Math.max(10, Number(body.limit) || 50));
      const r = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=${limit}`, { headers: { Authorization: `Bot ${botToken}` } });
      if (!r.ok) return json({ error: `Discord refused the request (${r.status}). Check the bot is in the server and can read the channel.` }, 502);
      const raw = await r.json() as Array<Record<string, unknown>>;
      const messages = raw.reverse().map((m) => {
        const a = m.author as Record<string, unknown>;
        const avatar = a.avatar ? `https://cdn.discordapp.com/avatars/${a.id}/${a.avatar}.png?size=64` : null;
        return {
          id: m.id,
          author: (a.global_name as string) || (a.username as string) || 'Unknown',
          avatar,
          bot: !!a.bot,
          content: m.content,
          timestamp: m.timestamp,
          attachments: ((m.attachments as Array<Record<string, unknown>>) || []).map(x => ({ url: x.url, name: x.filename })),
        };
      });
      return json({ messages });
    }

    if (body.action === 'send') {
      if (!webhook) return json({ error: 'The Discord webhook is not set up yet' }, 500);
      const content = String(body.content || '').trim();
      if (!content) return json({ error: 'Nothing to send' }, 400);
      const r = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.slice(0, 1900),
          username: member.discord_username || member.display_name,
          avatar_url: member.discord_avatar || member.avatar_url || undefined,
          allowed_mentions: { parse: ['users'] },
        }),
      });
      if (!r.ok) return json({ error: `Discord refused the message (${r.status})` }, 502);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
