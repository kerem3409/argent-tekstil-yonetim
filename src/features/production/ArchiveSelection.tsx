import { useState } from 'react';
import type { ProductionOrder } from '../../domain/productionOrder';
import { orderRepository } from '../../data/production';
import { Field, Form } from '../shared/WorkshopUI';
import { ProductionDialog } from './ProductionDialog';

export function ArchiveSelection({ visible, selected, select, done }: { visible: ProductionOrder[]; selected: string[]; select: (ids: string[]) => void; done: () => void }) {
  const selectedOrders = visible.filter((o) => selected.includes(o.id));
  const [pending, setPending] = useState<{ action: 'restore' | 'trash'; records: { id: string; revision: number }[] }>();
  const [configured, setConfigured] = useState<boolean>(); const [error, setError] = useState('');
  async function open(action: 'restore' | 'trash') { setError(''); try { setConfigured(await orderRepository.deletionPin.configured()); setPending({ action, records: selectedOrders.map(({ id, revision }) => ({ id, revision })) }); } catch (e) { setError((e as Error).message); } }
  return <div className="ws-tabs"><label><input type="checkbox" checked={visible.length > 0 && selectedOrders.length === visible.length} onChange={(e) => select(e.target.checked ? visible.map((o) => o.id) : [])} /> Tümünü Seç</label><span>{selectedOrders.length} seçili</span><button className="button ws-secondary" disabled={!selectedOrders.length} onClick={() => void open('restore')}>Seçilenleri Arşivden Çıkar</button><button className="button ws-secondary" disabled={!selectedOrders.length} onClick={() => void open('trash')}>Seçilenleri Sil</button>{error && <p role="alert">{error}</p>}
    {pending && <ProductionDialog title={pending.action === 'trash' ? 'Seçilenleri Çöp Kutusuna Taşı' : 'Seçilenleri Geri Yükle'} close={() => setPending(undefined)}><p>{pending.records.length} kayıt ve bağlı aşama bilgileri birlikte taşınacak. Kalıcı silme yapılmaz.</p><Form label={pending.action === 'trash' && !configured ? 'PIN Belirle' : 'İşlemi Onayla'} cancel={() => setPending(undefined)} onDone={() => { if (pending.action === 'restore' || configured) { setPending(undefined); select([]); done(); } }} onSubmit={async (f) => {
      if (pending.action === 'trash' && !configured) { await orderRepository.deletionPin.setup(String(f.get('pin')), String(f.get('confirmation'))); setConfigured(true); return; }
      await orderRepository.bulkArchiveAction(pending.records, pending.action, String(f.get('pin') ?? ''));
    }}>{pending.action === 'trash' && <><Field label="Silme Şifresi / PIN"><input name="pin" type="password" required minLength={configured ? undefined : 6} autoComplete={configured ? 'current-password' : 'new-password'} /></Field>{!configured && <Field label="PIN Tekrar"><input name="confirmation" type="password" required autoComplete="new-password" /></Field>}</>}</Form></ProductionDialog>}
  </div>;
}
