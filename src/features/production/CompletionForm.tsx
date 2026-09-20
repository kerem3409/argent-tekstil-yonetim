import { useState } from 'react';
import { completeProduction } from '../../data/production/services';
import type { ProductionPlan } from '../../domain/production';
import { planQuantity } from '../../domain/production';
import { Field, Form, Input, Section, numeric, text } from '../shared/WorkshopUI';
import { today } from '../products/model';
export function CompletionForm({ plan, jobId, done }: { plan: ProductionPlan; jobId: string; done: () => void }) {
  const [good, setGood] = useState(plan.colors.map((c) => c.quantity));
  const total = good.reduce((sum, n) => sum + (n || 0), 0);
  return <Section title="Üretimi Tamamla ve Stoğa Aktar"><Form label="Üretimi Tamamla ve Stoğa Aktar" onDone={done} onSubmit={(f) => completeProduction(jobId, plan.colors.map((c, i) => ({ colorId: c.id, good: good[i] })), numeric(f, 'waste'), text(f, 'date'), text(f, 'note'))}><div className="ws-grid">{plan.colors.map((c, i) => <Field key={c.id} label={`${c.color} · Sağlam Ürün Adedi (plan ${c.quantity}) *`}><input type="number" required min="0" max={c.quantity} step="1" value={Number.isNaN(good[i]) ? '' : good[i]} onChange={(e) => setGood(good.map((n, j) => j === i ? e.target.valueAsNumber : n))} /></Field>)}<Input label="Fire / Hatalı Adet *" name="waste" type="number" min="0" step="1" value={0} required /><Input label="Tamamlama Tarihi *" name="date" type="date" value={today()} required /><Input label="Not" name="note" /></div><p className="ws-hint">Sağlam toplam: {total} · Planlanan: {planQuantity(plan)} · Beklenen fire: {planQuantity(plan) - total}. Yalnızca sağlam ürünler renk bazında stoğa aktarılır. İlk sürümde üretim birim maliyeti, aşama maliyetleri / sağlam adet üzerinden hesaplanır; kumaş ve malzeme tüketimi otomatik dağıtılmaz.</p></Form></Section>;
}
