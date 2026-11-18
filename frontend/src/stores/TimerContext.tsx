import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ActiveTimer, EntryType } from "@ryty/shared";
import { api } from "../services/api";

interface TimerContextValue {
  active: (ActiveTimer & { elapsedSeconds: number }) | null;
  /** Live elapsed seconds for display, ticking every second locally. */
  elapsed: number;
  loading: boolean;
  refresh: () => Promise<void>;
  start: (title: string, description?: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: (overrides?: { title?: string; description?: string | null }) => Promise<EntryType>;
}

const TimerContext = createContext<TimerContextValue | null>(null);

/**
 * The server owns the timekeeping; this context only displays it. The local
 * tick derives from the server-reported elapsed seconds so refreshes, tab
 * suspension and clock drift never corrupt the duration.
 */
export function TimerProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<(ActiveTimer & { elapsedSeconds: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const anchorRef = useRef<{ at: number; elapsed: number } | null>(null);

  const syncAnchor = useCallback((timer: (ActiveTimer & { elapsedSeconds: number }) | null) => {
    setActive(timer);
    setElapsed(timer?.elapsedSeconds ?? 0);
    anchorRef.current = timer ? { at: Date.now(), elapsed: timer.elapsedSeconds } : null;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      syncAnchor(await api.activeTimer());
    } catch {
      syncAnchor(null);
    } finally {
      setLoading(false);
    }
  }, [syncAnchor]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!anchorRef.current) return;
    const id = window.setInterval(() => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      setElapsed(anchor.elapsed + Math.floor((Date.now() - anchor.at) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const start = useCallback(
    async (title: string, description?: string) => {
      syncAnchor(await api.startTimer(title, description));
    },
    [syncAnchor],
  );

  const pause = useCallback(async () => {
    syncAnchor(await api.pauseTimer());
  }, [syncAnchor]);

  const resume = useCallback(async () => {
    syncAnchor(await api.resumeTimer());
  }, [syncAnchor]);

  const stop = useCallback(
    async (overrides?: { title?: string; description?: string | null }) => {
      const activity = await api.stopTimer(overrides);
      syncAnchor(null);
      return activity.entryType;
    },
    [syncAnchor],
  );

  const value = useMemo(
    () => ({ active, elapsed, loading, refresh, start, pause, resume, stop }),
    [active, elapsed, loading, refresh, start, pause, resume, stop],
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be used within TimerProvider");
  return ctx;
}
