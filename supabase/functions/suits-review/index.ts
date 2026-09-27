// Application reviews require the verified SUITS owner's session.
// Deploy with --no-verify-jwt: the handler verifies the bearer token via Auth getUser.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createReviewHandler } from '../_shared/suits-review.ts';

Deno.serve(createReviewHandler(authorization => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
  { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
)));
