import { financeRepository } from '../../data/finance';
import type { AccountAdjustment } from '../../domain/finance';
import { today } from '../products/model';
import { Form, Input, Section, Select, numeric, text } from '../shared/WorkshopUI';
export function AdjustmentForm({ account, done }: { account: string; done: () => void }) {
  return <Section title="Mahsup / Diğer Cari Hareket"><Form onDone={done} onSubmit={(f) => { const [companyId, responsibleId] = account.split('|'); return financeRepository.adjustment({ companyId, responsibleId: responsibleId || '', type: text(f, 'type') as AccountAdjustment['type'], direction: text(f, 'direction') as AccountAdjustment['direction'], amount: numeric(f, 'amount'), date: text(f, 'date'), description: text(f, 'description') }); }}><div className="ws-grid"><Select label="Kaynak" name="type" values={['Mahsup', 'Diğer']} /><Select label="Cari Etki" name="direction" values={['Borç', 'Alacak']} /><Input label="Tutar (TL) *" name="amount" type="number" min="0.01" step="0.01" required /><Input label="Tarih *" name="date" type="date" value={today()} required /><Input label="Açıklama *" name="description" required /></div><p className="ws-hint">Borç bizim net borcumuzu artırır, Alacak azaltır. Bu işlem nakit hareketi oluşturmaz. Mevcut alış, satış veya ödemeyi burada tekrar kaydetmeyin.</p></Form></Section>;
}
