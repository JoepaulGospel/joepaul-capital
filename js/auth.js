import { supabase } from './supabase.js';

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/** Redirects to login.html when there is no session. Returns the session or null. */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

/** Passwordless magic-link login. */
export async function signInWithEmail(email) {
  const base = window.location.href.replace(/[^/]*$/, '');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: base + 'index.html' },
  });
  return error;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}
