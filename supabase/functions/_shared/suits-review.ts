import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const ALLOWED_STATUS = new Set(['new', 'interview', 'accepted', 'rejected']);

export function createReviewHandler(createUserClient: (authorization: string) => SupabaseClient) {
return async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const authorization = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: 'Sign in with your SUITS account.' }, 401);
  const client = createUserClient(authorization);
  // getUser verifies the token with Supabase Auth; never trust submitted email or metadata.
  let user;
  try {
    const result = await client.auth.getUser();
    if (result.error || !result.data.user) return json({ error: 'Sign in with your SUITS account.' }, 401);
    user = result.data.user;
  } catch {
    return json({ error: 'Could not verify your sign-in.' }, 401);
  }
  if (user.email?.toLowerCase() !== 'kcyle@terpmail.umd.edu' || !user.email_confirmed_at) {
    return json({ error: 'Application reviews are available only to the SUITS owner account.' }, 403);
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request');
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  // All operations also run under the caller's database and storage policies.
  const action = body.action;

  try {
    if (action === 'list') {
      const { data, error } = await client
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
      const { error } = await client.from('suits_applications').update(patch).eq('id', id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'resume') {
      const path = String(body.resume_path ?? '');
      if (!path) return json({ error: 'Missing resume_path' }, 400);
      const { data: application, error: lookupError } = await client.from('suits_applications').select('id').eq('resume_path', path).limit(1).maybeSingle();
      if (lookupError) throw lookupError;
      if (!application) return json({ error: 'Resume not found' }, 404);
      const { data, error } = await client.storage.from('suits-resumes').createSignedUrl(path, 300);
      if (error) throw error;
      return json({ url: data.signedUrl });
    }

    if (action === 'delete') {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'Missing id' }, 400);
      const { data: row } = await client.from('suits_applications').select('resume_path').eq('id', id).single();
      if (row?.resume_path) await client.storage.from('suits-resumes').remove([row.resume_path]);
      const { error } = await client.from('suits_applications').delete().eq('id', id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
};
}
