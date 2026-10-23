import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { env, isSupabaseConfigured } from './env';

const webStorage = {
  getItem: (key: string) =>
    typeof window === 'undefined' ? null : window.localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  },
};

function create(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
}

/** `null` when the project is not configured yet; screens show a clear notice in that case. */
export const supabase: SupabaseClient | null = create();

/** Use in code paths that only run when the backend is configured. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export function functionUrl(name: string): string {
  return `${env.supabaseUrl}/functions/v1/${name}`;
}
