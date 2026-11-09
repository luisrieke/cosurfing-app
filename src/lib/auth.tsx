import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getEntitlement, getFavoriteIds, getProfile, setFavorite as persistFavorite } from './queries';
import { supabase } from './supabase';
import type { Entitlement, Profile } from './types';

interface AuthState {
  ready: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  entitlement: Entitlement | null;
  isPlus: boolean;
  isAdmin: boolean;
  /** Trusted contributor: new changes go live without admin review. */
  isLocalGuide: boolean;
  favoriteIds: Set<string>;
  refresh: () => Promise<void>;
  toggleFavorite: (placeId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Without a configured backend there is nothing to load: we are ready immediately.
  const [ready, setReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [isPlus, setIsPlus] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLocalGuide, setIsLocalGuide] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const loadId = useRef(0);

  const loadUserData = useCallback(async (user: User | null) => {
    const id = ++loadId.current;
    if (!user || !supabase) {
      setProfile(null);
      setEntitlement(null);
      setIsPlus(false);
      setIsAdmin(false);
      setIsLocalGuide(false);
      setFavoriteIds(new Set());
      return;
    }
    const [profileRes, entitlementRes, plusRes, adminRes, guideRes, favRes] = await Promise.allSettled([
      getProfile(user.id),
      getEntitlement(user.id),
      supabase.rpc('is_plus'),
      supabase.rpc('is_admin'),
      supabase.rpc('is_local_guide'),
      getFavoriteIds(user.id),
    ]);
    if (id !== loadId.current) return;
    setProfile(profileRes.status === 'fulfilled' ? profileRes.value : null);
    setEntitlement(entitlementRes.status === 'fulfilled' ? entitlementRes.value : null);
    setIsPlus(plusRes.status === 'fulfilled' ? Boolean(plusRes.value.data) : false);
    setIsAdmin(adminRes.status === 'fulfilled' ? Boolean(adminRes.value.data) : false);
    setIsLocalGuide(guideRes.status === 'fulfilled' ? Boolean(guideRes.value.data) : false);
    setFavoriteIds(favRes.status === 'fulfilled' ? favRes.value : new Set());
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        await loadUserData(data.session?.user ?? null);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void loadUserData(next?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadUserData]);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadUserData(data.session?.user ?? null);
  }, [loadUserData]);

  const toggleFavorite = useCallback(
    async (placeId: string) => {
      const user = session?.user;
      if (!user) return;
      const on = !favoriteIds.has(placeId);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (on) next.add(placeId);
        else next.delete(placeId);
        return next;
      });
      try {
        await persistFavorite(user.id, placeId, on);
      } catch {
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (on) next.delete(placeId);
          else next.add(placeId);
          return next;
        });
      }
    },
    [session, favoriteIds],
  );

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      profile,
      entitlement,
      isPlus,
      isAdmin,
      isLocalGuide,
      favoriteIds,
      refresh,
      toggleFavorite,
      signOut,
    }),
    [ready, session, profile, entitlement, isPlus, isAdmin, isLocalGuide, favoriteIds, refresh, toggleFavorite, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
