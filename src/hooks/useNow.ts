import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * The current time, updated at the start of every minute and when the app comes back to the
 * foreground, so "open now" labels and filters follow the clock.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setNow(new Date());
          schedule();
        },
        60_000 - (Date.now() % 60_000) + 50,
      );
    };
    schedule();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);
  return now;
}

/** Changes once a minute: a cheap dependency for effects that should re-run as time passes. */
export function minuteKey(now: Date): number {
  return Math.floor(now.getTime() / 60_000);
}

const REQUERY_MS = 15 * 60_000;

/**
 * While "Open now" / "Work here now" is on, asks the server again on every quarter hour (when most
 * places open and close; every time zone offset is a multiple of 15 minutes) and after the app was
 * away for longer. Places that close in between are dropped on the client with `matchesTimeFilter`.
 */
export function useTimeFilterRefresh(active: boolean, now: Date, refresh: () => unknown) {
  const last = useRef(now.getTime());
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  const minute = minuteKey(now);
  useEffect(() => {
    if (!active) {
      last.current = Date.now();
      return;
    }
    if (minute % 15 === 0 || Date.now() - last.current >= REQUERY_MS) {
      last.current = Date.now();
      void refreshRef.current();
    }
  }, [active, minute]);
}
