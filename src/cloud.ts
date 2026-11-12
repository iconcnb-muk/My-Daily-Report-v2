/** Minimal Supabase REST/Auth client. Uses only the public anon key; never put a service-role key in the browser. */
export type CloudSession = { access_token: string; refresh_token: string; expires_at?: number; user: { id: string; email?: string } };
const url = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const cloudConfigured = Boolean(url && key);
const SESSION_KEY = 'daily-report-cloud-session-v1';
export function getCloudSession(): CloudSession | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as CloudSession | null; } catch { return null; }
}
function saveSession(session: CloudSession | null) { if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY); }
async function authRequest(path: string, body?: unknown, token?: string) {
  const response = await fetch(`${url}/auth/v1/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body || {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || 'Authentication failed');
  return data;
}
export async function cloudSignIn(email: string, password: string) { const data = await authRequest('token?grant_type=password', { email, password }); saveSession({ ...data, expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600) }); }
export async function cloudSignUp(email: string, password: string) { const data = await authRequest('signup', { email, password }); if (data.access_token) saveSession({ ...data, expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600) }); return Boolean(data.access_token); }
export async function cloudResetPassword(email: string) { await authRequest(`recover?redirect_to=${encodeURIComponent(window.location.origin)}`, { email }); }
export async function cloudSignOut() { const session = getCloudSession(); if (session) await authRequest('logout', {}, session.access_token).catch(() => undefined); saveSession(null); }
async function validSession(): Promise<CloudSession> {
  const current = getCloudSession();
  if (!current) throw new Error('Please sign in');
  if (current.expires_at && current.expires_at < Math.floor(Date.now() / 1000) + 60) {
    const data = await authRequest('token?grant_type=refresh_token', { refresh_token: current.refresh_token });
    const refreshed: CloudSession = { ...data, expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600) };
    saveSession(refreshed);
    return refreshed;
  }
  return current;
}
export async function cloudFetch<T>(table: string, query: string, init: RequestInit = {}): Promise<T> {
  if (!cloudConfigured) throw new Error('Cloud service is not configured');
  const session = await validSession();
  const response = await fetch(`${url}/rest/v1/${table}${query ? `?${query}` : ''}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!response.ok) { const detail = await response.text(); throw new Error(detail || `Cloud request failed (${response.status})`); }
  if (response.status === 204) return undefined as T;
  const payload = await response.text();
  if (!payload) return undefined as T;
  return JSON.parse(payload) as T;
}
export async function cloudSaveSnapshot(data: Record<string, unknown>) {
  const session = await validSession();
  await cloudFetch('app_data', 'on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: session.user.id, data, updated_at: new Date().toISOString() }) });
}
export async function cloudLoadSnapshot() {
  const session = await validSession();
  const rows = await cloudFetch<Array<{ data: Record<string, unknown> }>>('app_data', `user_id=eq.${encodeURIComponent(session.user.id)}&select=data&limit=1`);
  return rows[0]?.data || null;
}
export function cloudUserId() { return getCloudSession()?.user.id || null; }
export async function cloudRole() {
  const session = await validSession();
  const rows = await cloudFetch<Array<{ role: string }>>('profiles', `id=eq.${encodeURIComponent(session.user.id)}&select=role&limit=1`);
  return rows[0]?.role || 'user';
}
export async function cloudAdminUsers() { return cloudFetch<Array<{ id: string; email: string; role: string; created_at: string }>>('admin_user_directory', 'select=id,email,role,created_at&order=created_at.desc'); }
export async function cloudUpdateUserRole(id: string, role: string) { return cloudFetch('profiles', `id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ role }) }); }

export async function cloudUpdatePassword(password: string) { const session = await validSession(); const response = await fetch(`${url}/auth/v1/user`, { method: 'PUT', headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); if (!response.ok) throw new Error('Password update failed'); }

export async function cloudConsumeRecoveryHash(): Promise<CloudSession | null> {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (params.get('type') !== 'recovery') return null;
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token') || '';
  if (!accessToken) return null;
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error('Password recovery link is invalid or expired');
  const user = await response.json();
  const session: CloudSession = { access_token: accessToken, refresh_token: refreshToken, expires_at: Number(params.get('expires_at')) || Math.floor(Date.now() / 1000) + Number(params.get('expires_in') || 3600), user };
  saveSession(session);
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  return session;
}
