import { useEffect, useRef, useState } from 'react';
import type { ProductionOrderCard, ProductionRecord } from '../../domain/productionWorkflow';
import { workflowRepository } from '../../data/production';

export function RecordActions({ kind, record, done }: { kind: 'order' | 'production'; record: ProductionOrderCard | ProductionRecord; done: () => void }) {
  const [operation, setOperation] = useState<'archive' | 'delete' | 'restore'>();
  return <span className="record-actions">
    {record.deleted ? <button type="button" className="button ws-secondary" onClick={() => setOperation('restore')}>Çöp Kutusundan Geri Yükle</button> : <>
      {kind === 'order' && <button type="button" className="button ws-secondary" onClick={() => setOperation('archive')}>{record.archived ? 'Arşivden Çıkar' : 'Arşive At'}</button>}
      <button type="button" className="button ws-secondary" onClick={() => setOperation('delete')}>Sil</button>
    </>}
    {operation && <RecordDialog kind={kind} record={record} operation={operation} close={() => setOperation(undefined)} done={() => { setOperation(undefined); done(); }} />}
  </span>;
}

function RecordDialog({ kind, record, operation, close, done }: { kind: 'order' | 'production'; record: ProductionOrderCard | ProductionRecord; operation: 'archive' | 'delete' | 'restore'; close: () => void; done: () => void }) {
  const [configured, setConfigured] = useState<boolean>();
  const [pin, setPin] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null); const running = useRef(false);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialog.current?.focus(); let active = true;
    if (operation === 'delete') void workflowRepository.deletionPin.configured().then((value) => { if (active) setConfigured(value); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; trigger?.focus(); };
  }, [operation]);
  const message = operation === 'archive'
    ? record.archived ? 'Bu sipariş kartı, bağlı kesim emirleri ve üretim kartları tekrar aktif hale getirilecek. Devam etmek istiyor musunuz?' : 'Bu sipariş kartı, bağlı kesim emirleri ve üretim kartları arşive alınacak. Devam etmek istiyor musunuz?'
    : operation === 'delete' ? kind === 'order' ? 'Bu sipariş kartı, bağlı kesim emirleri ve üretim kartları Çöp Kutusuna taşınacak. Devam etmek için şifrenizi girin.' : 'Bu üretim kartı Çöp Kutusuna taşınacak. Devam etmek için şifrenizi girin.'
    : kind === 'order' ? 'Sipariş ve onunla birlikte silinen kesim emirleri ve üretimler geri yüklenecek. Daha önce ayrı silinen üretimler Çöp Kutusunda kalacak.' : 'Üretim kartı geri yüklenecek. Sipariş ilişkisi ve kullanılabilir tahsis miktarı kontrol edilecek.';
  const label = operation === 'archive' ? record.archived ? 'Arşivden Çıkar' : 'Arşive At' : operation === 'restore' ? 'Çöp Kutusundan Geri Yükle' : configured === false ? 'Silme Şifresini Belirle' : 'Çöp Kutusuna Taşı';
  async function submit() {
    if (running.current) return; running.current = true; setBusy(true); setError('');
    try {
      if (operation === 'delete' && configured === false) {
        await workflowRepository.deletionPin.setup(pin, confirmation); setConfigured(true); setPin(''); setConfirmation(''); return;
      }
      const revision = record.revision ?? 0;
      if (operation === 'archive') await workflowRepository.setOrderArchived(record.id, revision, !record.archived);
      else if (operation === 'delete') {
        if (kind === 'order') await workflowRepository.deleteOrder(record.id, revision, pin);
        else await workflowRepository.deleteProduction(record.id, revision, pin);
      } else if (kind === 'order') await workflowRepository.restoreOrder(record.id, revision);
      else await workflowRepository.restoreProduction(record.id, revision);
      done();
    } catch (e) { setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı.'); }
    finally { running.current = false; setBusy(false); }
  }
  return <div className="record-dialog-backdrop"><div className="record-dialog" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={dialog} onKeyDown={(event) => {
    if (event.key === 'Escape' && !busy) { event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])];
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <h2>{'orderNo' in record ? record.orderNo : record.productionNo}</h2><p>{message}</p>
    {operation === 'delete' && <p className="ws-hint">Kesim başlamamışsa tahsis serbest kalır. Başlamış üretimin miktarı, stok ve cari geçmişi korunur. Bu işlem fiziksel silme yapmaz.</p>}
    {operation === 'delete' && configured === undefined && !error && <p>Şifre bilgisi yükleniyor…</p>}
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {operation === 'delete' && configured !== undefined && <>
        <p className="ws-hint">{configured ? 'Silme şifrenizi/PIN’inizi girin.' : 'İlk kullanım: bir silme şifresi/PIN belirleyin (en az 6 karakter).'} Bu şifre yalnızca bu tarayıcıya özeldir; kullanıcı yetkilendirmesi değildir.</p>
        <label className="ws-field"><span>{configured ? 'Silme Şifresi / PIN' : 'Yeni Silme Şifresi / PIN'}</span><input type="password" autoComplete={configured ? 'current-password' : 'new-password'} value={pin} minLength={configured ? undefined : 6} maxLength={128} required disabled={busy} onChange={(e) => setPin(e.target.value)} /></label>
        {!configured && <label className="ws-field"><span>Şifre / PIN Tekrar</span><input type="password" autoComplete="new-password" value={confirmation} required maxLength={128} disabled={busy} onChange={(e) => setConfirmation(e.target.value)} /></label>}
      </>}
      {error && <p className="ws-error" role="alert">{error}</p>}
      <div className="ws-actions"><button type="button" className="button ws-secondary" disabled={busy} onClick={close}>Vazgeç</button><button className="button" disabled={busy || (operation === 'delete' && configured === undefined)}>{busy ? 'İşleniyor…' : label}</button></div>
    </form>
  </div></div>;
}
