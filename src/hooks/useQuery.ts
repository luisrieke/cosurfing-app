import { useCallback, useEffect, useRef, useState } from 'react';

interface QueryState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
}

/**
 * Minimal data hook: runs `fn` when `key` changes, exposes loading/error/refetch.
 * Good enough for this MVP; swap for TanStack Query if caching needs grow.
 */
export function useQuery<T>(key: string, fn: () => Promise<T>, enabled = true) {
  const [state, setState] = useState<QueryState<T>>({ data: undefined, error: null, loading: enabled });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const runId = useRef(0);

  const run = useCallback(async (silent = false) => {
    const id = ++runId.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (id === runId.current) setState({ data, error: null, loading: false });
    } catch (e) {
      if (id === runId.current) {
        setState((s) => ({ ...s, error: e instanceof Error ? e : new Error(String(e)), loading: false }));
      }
    }
  }, []);

  // `key` is the query identity: callers change it to request a new fetch, while `fn`
  // itself is read through a ref so inline closures do not refetch on every render.
  // biome-ignore lint/correctness/useExhaustiveDependencies(key): intentional trigger, not read inside
  useEffect(() => {
    if (!enabled) {
      setState({ data: undefined, error: null, loading: false });
      return;
    }
    void run();
  }, [key, enabled, run]);

  const setData = useCallback((updater: (prev: T | undefined) => T | undefined) => {
    setState((s) => ({ ...s, data: updater(s.data) }));
  }, []);

  return { ...state, refetch: run, setData };
}
