import { useCallback, useEffect, useRef, useState } from 'react';

import type { Page } from '@/lib/queries';

interface PagedState<T> {
  /** The `key` the items belong to; differs from the current key while a new list loads. */
  key: string | null;
  items: T[];
  total: number;
  loadingMore: boolean;
  error: Error | null;
}

const EMPTY = { key: null, items: [], total: 0, loadingMore: false, error: null };

/**
 * Offset pagination on top of a page fetcher. Changing `key` resets the list.
 * `refresh` reloads everything that is currently shown (used for polling).
 */
export function usePaged<T>(key: string, fetchPage: (offset: number, limit: number) => Promise<Page<T>>, pageSize: number, enabled = true) {
  const [state, setState] = useState<PagedState<T>>(EMPTY);
  const fetchRef = useRef(fetchPage);
  const runId = useRef(0);
  const stateRef = useRef(state);
  // Declared before the load effect so the refs are current when it runs in the same commit.
  useEffect(() => {
    fetchRef.current = fetchPage;
    stateRef.current = state;
  });

  useEffect(() => {
    const id = ++runId.current;
    if (!enabled) return;
    fetchRef
      .current(0, pageSize)
      .then((page) => {
        if (id === runId.current) setState({ key, items: page.items, total: page.total, loadingMore: false, error: null });
      })
      .catch((e: unknown) => {
        if (id === runId.current) {
          setState({ key, items: [], total: 0, loadingMore: false, error: e instanceof Error ? e : new Error(String(e)) });
        }
      });
  }, [key, enabled, pageSize]);

  // While a new key loads, the previous list stays visible (like a filter change on the web).
  const view = enabled ? state : EMPTY;
  const loading = enabled && state.key !== key;

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (s.key !== key || s.loadingMore || s.items.length >= s.total) return;
    const id = runId.current;
    setState((prev) => ({ ...prev, loadingMore: true }));
    fetchRef
      .current(s.items.length, pageSize)
      .then((page) => {
        if (id !== runId.current) return;
        setState((prev) => {
          const seen = new Set(prev.items.map((i) => (i as { id?: string }).id));
          const fresh = page.items.filter((i) => !seen.has((i as { id?: string }).id));
          return { ...prev, items: [...prev.items, ...fresh], total: page.total, loadingMore: false };
        });
      })
      .catch(() => {
        if (id === runId.current) setState((prev) => ({ ...prev, loadingMore: false }));
      });
  }, [key, pageSize]);

  const refresh = useCallback(async () => {
    const id = runId.current;
    const limit = Math.max(pageSize, stateRef.current.items.length);
    try {
      const page = await fetchRef.current(0, limit);
      if (id === runId.current) setState((prev) => ({ ...prev, key, items: page.items, total: page.total, error: null }));
    } catch {
      // keep showing the current list
    }
  }, [key, pageSize]);

  return {
    items: view.items as T[],
    total: view.total,
    loading,
    loadingMore: view.loadingMore,
    error: view.error,
    hasMore: view.items.length < view.total,
    loadMore,
    refresh,
  };
}
