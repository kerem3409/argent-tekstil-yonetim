import type { ReactNode } from 'react';
export function ProductionDisclosure({ title, summary, children }: { title: string; summary?: string; children: ReactNode }) {
  return <details className="production-disclosure"><summary><h2>{title}</h2>{summary && <span>{summary}</span>}</summary><div className="production-disclosure-body">{children}</div></details>;
}
