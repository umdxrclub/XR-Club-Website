// NASA SUITS review backend for /suits/dashboard.
//
// The dashboard is opened with a single shared password, with no user
// accounts. The password is checked here, on the server, against the
// SUITS_DASHBOARD_PASSWORD secret; only a matching request can read or change
// applications, which this function does with the service role key.
//
// Deploy:  npx supabase functions deploy suits-review --no-verify-jwt
// Secret:  npx supabase secrets set SUITS_DASHBOARD_PASSWORD=your-password

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Compare without leaking timing information about how much of the password matched.
function passwordMatches(given: string, expected: string) {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

const ALLOWED_STATUS = new Set(['new', 'interview', 'accepted', 'rejected']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const expected = Deno.env.get('SUITS_DASHBOARD_PASSWORD');
  if (!expected) {
    return json({ error: 'SUITS_DASHBOARD_PASSWORD is not set on the server' }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (!passwordMatches(password, expected)) {
    return json({ error: 'Wrong password' }, 401);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const action = body.action;

  try {
    if (action === 'list') {
      const { data, error } = await admin
        .from('suits_applications')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return json({ applications: data });
    }

    if (action === 'update') {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'Missing id' }, 400);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.status !== undefined) {
        if (!ALLOWED_STATUS.has(String(body.status))) return json({ error: 'Invalid status' }, 400);
        patch.status = body.status;
      }
      if (body.reviewer_notes !== undefined) {
        patch.reviewer_notes = body.reviewer_notes === null ? null : String(body.reviewer_notes);
      }
      const { error } = await admin.from('suits_applications').update(patch).eq('id', id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'resume') {
      const path = String(body.resume_path ?? '');
      if (!path) return json({ error: 'Missing resume_path' }, 400);
      const { data, error } = await admin.storage.from('suits-resumes').createSignedUrl(path, 300);
      if (error) throw error;
      return json({ url: data.signedUrl });
    }

    if (action === 'delete') {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'Missing id' }, 400);
      const { data: row } = await admin.from('suits_applications').select('resume_path').eq('id', id).single();
      if (row?.resume_path) await admin.storage.from('suits-resumes').remove([row.resume_path]);
      const { error } = await admin.from('suits_applications').delete().eq('id', id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
