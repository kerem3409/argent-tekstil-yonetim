import { useState } from 'react';
import type { Contact } from '../contacts/model';
import { productionRepository } from '../../data/production';
import { operations, operationTotals, stageStatuses } from '../../domain/production';
import type { Operation, ProductionStore, StageInput } from '../../domain/production';
import { CompanySelect, Form, Input, Section, Select, Table, numeric, text } from '../shared/WorkshopUI';
import { today } from '../products/model';

export function StageForm({ data, jobId, contacts, done }: { data: ProductionStore; jobId: string; contacts: Contact[]; done: () => void }) {
  const [selected, setSelected] = useState<Operation[]>([]); const totals = operationTotals(data, jobId);
  const preferred = contacts.filter((c) => c.roles.includes('Fasoncu') && selected.every((op) => c.services.some((service) => service === (op === 'Ütü' || op === 'Paketleme' ? 'Ütü & Paket' : op)))).map((c) => c.id);
  return <Form onDone={done} onSubmit={(f) => productionRepository.addStage({ jobId, companyId: text(f, 'companyId'), date: text(f, 'date'), status: text(f, 'status') as StageInput['status'], note: text(f, 'note'), lines: selected.map((operation) => ({ operation, quantity: numeric(f, `quantity-${operation}`), returned: numeric(f, `returned-${operation}`), priceType: text(f, `priceType-${operation}`) as 'Adet Fiyatı' | 'Toplam Fiyat', price: numeric(f, `price-${operation}`) })) })}>
    <Section title="Yeni Üretim Aşaması"><div className="ws-checks">{operations.map((operation) => <label key={operation}><input type="checkbox" checked={selected.includes(operation)} onChange={(e) => setSelected(e.target.checked ? [...selected, operation] : selected.filter((op) => op !== operation))} /> {operation}</label>)}</div>
      <div className="ws-grid"><CompanySelect key={selected.join('-')} contacts={contacts} role="Fasoncu" preferredIds={preferred} own /><Input label="Veriliş Tarihi *" name="date" type="date" value={today()} required /><Select label="Durum" name="status" values={stageStatuses} /><Input label="Not / Açıklama" name="note" /></div>
      {selected.map((operation) => <Section key={operation} title={`${operation} · Verilebilecek kalan: ${totals.find((t) => t.operation === operation)?.remaining ?? 0}`}><div className="ws-grid"><Input label="Verilen Adet *" name={`quantity-${operation}`} type="number" min="1" step="1" max={totals.find((t) => t.operation === operation)?.remaining} required /><Input label="Geri Gelen Toplam Adet *" name={`returned-${operation}`} type="number" min="0" step="1" value={0} required /><Select label="Fiyat Türü" name={`priceType-${operation}`} values={['Adet Fiyatı', 'Toplam Fiyat']} /><Input label="Fiyat (TL) *" name={`price-${operation}`} type="number" step="0.01" min="0" value={0} required /></div></Section>)}
      <p className="ws-hint">Her işlem ayrı fiyatlandırılır ve iş adedi sınırı ayrı uygulanır. Tamamlandı seçilince dış atölyenin carisine bir kez borç yansır. Kendi Atölyemiz için cari oluşmaz.</p>
    </Section>
  </Form>;
}
export function OperationSummary({ data, jobId }: { data: ProductionStore; jobId: string }) { return <Table headers={['İşlem', 'Toplam İş Adedi', 'Verilen', 'Kalan']} rows={operationTotals(data, jobId).map((item) => [item.operation, item.total, item.given, item.remaining])} />; }
