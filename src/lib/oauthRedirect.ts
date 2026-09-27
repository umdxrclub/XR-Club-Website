/** Same-origin callbacks only: a sign-in link must never send a session to another site. */
export function localAuthReturn(requested: string, origin: string, fallback: string): string {
  try {
    const target = new URL(requested, origin);
    if (target.origin === origin && !target.username && !target.password) {
      target.hash = '';
      for (const key of ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'id_token', 'code', 'token', 'token_hash']) target.searchParams.delete(key);
      return target.href;
    }
  } catch { /* Use the known local destination. */ }
  return new URL(fallback, origin).href;
}

/** Surface provider failures after a redirect without displaying any session tokens. */
export function googleCallbackError(search: string, hash: string): string | null {
  for (const part of [search, hash]) {
    const params = new URLSearchParams(part.replace(/^[?#]/, ''));
    const code = params.get('error_code') || params.get('error');
    const description = params.get('error_description');
    if (!code && !description) continue;
    if (code === 'access_denied') return 'Google sign-in was cancelled or access was denied. Please try again.';
    return `Google sign-in could not finish: ${(description || code || 'Unknown error').slice(0,300)}`;
  }
  return null;
}


const RETURN_KEY = 'xr-auth-return-to';
type ReturnStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Save only the destination in this tab; Supabase owns all session storage. */
export function prepareGoogleReturn(requested: string, origin: string, base: string, storage: ReturnStorage | null): string {
  const destination = localAuthReturn(requested, origin, `${base}suits/team/`);
  try { storage?.setItem(RETURN_KEY, destination); } catch { /* The callback can use the team overview. */ }
  return new URL(`${base}auth/callback/`, origin).href;
}

export function consumeGoogleReturn(origin: string, base: string, storage: ReturnStorage | null): string {
  let requested = '';
  try {
    requested = storage?.getItem(RETURN_KEY) || '';
    storage?.removeItem(RETURN_KEY);
  } catch { /* Storage may be disabled. */ }
  const fallback = new URL(`${base}suits/team/`, origin).href;
  if (!requested) return fallback;
  const destination = localAuthReturn(requested, origin, fallback);
  return new URL(destination).pathname.replace(/\/$/, '') === `${base}auth/callback` ? fallback : destination;
}

/** Finish initialization before removing credentials or leaving the callback. */
export async function finishGoogleReturn(options: {
  providerError: string | null;
  restoreSession: () => Promise<{ hasSession: boolean; error: unknown }>;
  clearAddress: () => void;
  navigate: () => void;
}): Promise<string | null> {
  let failure = options.providerError;
  try {
    if (!failure) {
      const result = await options.restoreSession();
      if (result.error || !result.hasSession) failure = 'Your sign-in could not be completed. Please return and try again.';
    }
  } catch {
    failure = 'Your sign-in could not be completed. Check your connection and try again.';
  } finally {
    options.clearAddress();
  }
  if (!failure) options.navigate();
  return failure;
}
