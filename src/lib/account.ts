import { env } from './env';
import { functionUrl, requireSupabase } from './supabase';

/** Permanently deletes the signed-in user's account. `storeSubscription` means an App Store / Play subscription still has to be cancelled there. */
export async function deleteAccount(): Promise<{ storeSubscription: boolean }> {
  const { data } = await requireSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('unauthorized');
  const res = await fetch(functionUrl('account'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'delete', confirm: 'DELETE' }),
  });
  const json = (await res.json().catch(() => ({}))) as { storeSubscription?: boolean; error?: string };
  if (!res.ok) throw new Error(json.error ?? 'server_error');
  return { storeSubscription: Boolean(json.storeSubscription) };
}
