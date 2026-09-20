import { useState } from 'react';
import type { WorkshopSnapshot } from '../../data/reports/snapshot';
import { financeRepository } from '../../data/finance';
import { OPEN_ACCOUNT_ID } from '../../domain/sales';
import { paymentMethods } from '../../domain/common';
import type { PaymentMethod } from '../../domain/common';
import { accountName } from '../../domain/accountSelectors';
import { Field, Form, Input, Section, Select, numeric, text } from '../shared/WorkshopUI';
import { today } from '../products/model';
export function AccountSelect({ data, value, onChange }: { data: WorkshopSnapshot; value: string; onChange: (value: string) => void }) {
  return <Field label="Firma / Kişi / Açığa Satış *"><select required value={value} onChange={(e) => onChange(e.target.value)}><option value="">Seçiniz</option>{data.contacts.map((c) => <option key={c.id} value={`${c.id}|`}>{c.name}{c.status === 'Pasif' ? ' (Pasif)' : ''}</option>)}{(data.products?.openResponsibles ?? []).map((p) => <option key={p.id} value={`${OPEN_ACCOUNT_ID}|${p.id}`}>{accountName(data, OPEN_ACCOUNT_ID, p.id)}</option>)}</select></Field>;
}
export function PaymentForm({ data, direction, defaultAccount = '', done }: { data: WorkshopSnapshot; direction: 'paid' | 'received'; defaultAccount?: string; done: () => void }) {
  const [account, setAccount] = useState(defaultAccount);
  return <Section title={direction === 'paid' ? 'Yeni Yapılan Ödeme' : 'Yeni Alınan Ödeme'}><Form onDone={done} onSubmit={(f) => { const [companyId, responsibleId] = account.split('|'); return financeRepository.payment({ companyId, responsibleId: responsibleId || '', direction, amount: numeric(f, 'amount'), date: text(f, 'date'), method: text(f, 'method') as PaymentMethod, description: text(f, 'description') }); }}><div className="ws-grid"><AccountSelect data={data} value={account} onChange={setAccount} /><Input label="Tutar (TL) *" name="amount" type="number" min="0.01" step="0.01" required /><Input label="Tarih *" name="date" type="date" value={today()} required /><Select label="Ödeme Şekli" name="method" values={paymentMethods} /><Input label="Açıklama *" name="description" required /></div><p className="ws-hint">Bu kayıt Para Hareketleri ve Cari Hesaplarda aynı işlem olarak gösterilir; genel gider oluşturmaz.</p></Form></Section>;
}
