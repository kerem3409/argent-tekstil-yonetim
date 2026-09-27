import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function ProductionDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const trigger = document.activeElement as HTMLElement; ref.current?.querySelector<HTMLElement>('input,button')?.focus(); return () => trigger?.focus(); }, []);
  return <div className="record-dialog-backdrop"><div ref={ref} className="record-dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') { const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)') ?? [])]; if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus(); } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); } }
  }}><h2>{title}</h2>{children}</div></div>;
}
