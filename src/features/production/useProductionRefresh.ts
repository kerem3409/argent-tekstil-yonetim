import { useEffect, useRef } from 'react';

// Read-only refresh: compares storage snapshots and never writes or migrates data.
// This also catches same-tab repository writes, for which browsers emit no storage event.
export function useProductionRefresh(refresh: () => void, keys: string[], enabled = true) {
  const callback = useRef(refresh); callback.current = refresh;
  const signature = keys.join('|');
  useEffect(() => {
    if (!enabled) return;
    const watched = signature.split('|');
    const read = () => watched.map((key) => window.localStorage.getItem(key));
    let previous: (string | null)[];
    try { previous = read(); } catch { return; }
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      try { const next = read(); if (next.some((raw,i) => raw !== previous[i])) { previous = next; callback.current(); } } catch { callback.current(); }
    };
    const interval = window.setInterval(check, 1000);
    window.addEventListener('focus', check); window.addEventListener('storage', check); document.addEventListener('visibilitychange', check);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', check); window.removeEventListener('storage', check); document.removeEventListener('visibilitychange', check); };
  }, [signature, enabled]);
}
