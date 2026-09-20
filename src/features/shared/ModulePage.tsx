import { useEffect, useState } from 'react';
import type { PageDefinition } from '../../app/navigation';
import { DataTable } from '../../components/DataTable';
import { workshopRepository } from '../../data';
import type { TableRecord } from '../../data/types';

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; records: TableRecord[] };

export function ModulePage({ page }: { page: PageDefinition }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    workshopRepository.listRecords(page.id).then(
      (records) => { if (active) setState({ status: 'ready', records }); },
      () => { if (active) setState({ status: 'error' }); },
    );
    return () => { active = false; };
  }, [page.id, attempt]);

  return <>
    <div className="page-heading"><div><h1>{page.title}</h1><p>{page.description}</p></div><span className="badge">Hazırlık aşamasında</span></div>
    <section className="table-panel" aria-label={page.title}>
      <div className="table-heading"><h2>Kayıtlar</h2>{state.status === 'ready' && <span className="record-count">{state.records.length} kayıt</span>}</div>
      {state.status === 'loading' && <div className="feedback" role="status">Kayıtlar yükleniyor…</div>}
      {state.status === 'error' && <div className="feedback" role="alert"><p>Kayıtlar yüklenemedi.</p><button className="button" onClick={() => setAttempt(attempt + 1)}>Tekrar dene</button></div>}
      {state.status === 'ready' && <DataTable title={page.title} columns={page.columns} records={state.records} />}
    </section>
    <p className="page-note">Bu sayfanın temel yapısı hazır. Kayıt ekleme ve işlem özellikleri sonraki aşamalarda eklenecek.</p>
  </>;
}
