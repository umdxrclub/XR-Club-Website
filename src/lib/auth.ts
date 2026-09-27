import { supabase } from './supabase';
import type { Profile } from './types';

export async function getUser(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return profile;
}

export async function signUp(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${window.location.origin}/verify-email`,
    },
  });
  return { data, error };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function requireAuth(): Promise<Profile | null> {
  const profile = await getUser();
  if (!profile) {
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
    return null;
  }
  return profile;
}

export async function requireRole(roles: string[]): Promise<Profile | null> {
  const profile = await getUser();
  if (!profile) {
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
    return null;
  }
  if (!roles.includes(profile.role)) {
    window.location.href = '/';
    return null;
  }
  return profile;
}
