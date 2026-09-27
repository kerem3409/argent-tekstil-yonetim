import { useEffect } from 'react';
import type { RefObject } from 'react';

export function useOrderDirtyGuard(dirty: boolean, container: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!dirty) return;
    const message = 'Kaydedilmemiş değişiklikler var. Ayrılmak istiyor musunuz?';
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const click = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a,button');
      if (!target || container.current?.contains(target)) return;
      if (!window.confirm(message)) { e.preventDefault(); e.stopPropagation(); }
    };
    const index = window.history.state?.idx ?? 0;
    let restoring = false;
    const pop = (e: PopStateEvent) => {
      if (restoring) { restoring = false; return; }
      if (!window.confirm(message)) { e.stopImmediatePropagation(); const delta = index - (e.state?.idx ?? index - 1); restoring = true; window.history.go(delta || 1); }
    };
    window.addEventListener('beforeunload', unload); window.addEventListener('popstate', pop, true); document.addEventListener('click', click, true);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('popstate', pop, true); document.removeEventListener('click', click, true); };
  }, [dirty, container]);
}
