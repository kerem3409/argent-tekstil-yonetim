const paths: Record<string, string> = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  stock: 'm3 7 9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10',
  production: 'M3 21V10l6 3V7l6 3V3h6v18z M7 17h1 M12 17h1 M17 17h1',
  sales: 'M3 3h2l3 12h11l2-8H6 M9 20h.01 M18 20h.01',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  finance: 'M3 5h17v15H3z M3 5V3h14 M16 11h5v5h-5z',
  reports: 'M4 3h12l4 4v14H4z M8 16v-3 M12 16V9 M16 16v-5',
  arrow: 'M5 12h14 m-5-5 5 5-5 5',
  empty: 'M4 4h16v16H4z M4 13h5l1 3h4l1-3h5',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.stock} /></svg>;
}
