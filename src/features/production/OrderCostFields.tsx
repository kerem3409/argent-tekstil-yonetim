import type { CostPrices } from '../../domain/productionCosts';
import { costMoney } from '../../domain/productionCosts';
import { extraCostCategories } from '../../domain/orderCosting';
import type { OrderCosting } from '../../domain/orderCosting';
import type { PlanStage } from '../../domain/productionPlan';
import type { Contact } from '../contacts/model';
import type { Material } from '../../domain/inventory';
import { Field } from '../shared/WorkshopUI';

export function OrderCostFields({ prices, costing, stages, contacts, materials, date, onPrices, onCosting }: { prices: CostPrices; costing: OrderCosting; stages: PlanStage[]; contacts: Contact[]; materials: Material[]; date: string; onPrices: (p: CostPrices) => void; onCosting: (v: OrderCosting) => void }) {
  const firms = (value: string, change: (v: string) => void, label: string, disabled = false) => <select aria-label={label} value={value} disabled={disabled} onChange={(e) => change(e.target.value)}><option value="">Cari bağlantısı yok</option>{contacts.filter((c) => c.status === 'Aktif' || c.id === value).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>;
  const accessoryTotal = costing.accessories.reduce((total, row) => {
    const stockPrice = row.materialId ? materials.find((m) => m.id === row.materialId)?.priceMinor : undefined;
    const price = stockPrice ?? row.priceMinor;
    return total + (price === undefined || row.quantity <= 0 ? 0 : Math.round(row.quantity * price));
  }, 0);
  const updateAccessory = (id: string, changes: Partial<OrderCosting['accessories'][number]>) => onCosting({ ...costing, accessories: costing.accessories.map((v) => v.id === id ? { ...v, ...changes } : v) });
  return <><div className="order-cost-prices">{(['Kumaş', ...stages] as const).map((key) => <Field key={key} label={key === 'Kumaş' ? 'Kumaş Kg Fiyatı (TL)' : `${key === 'Ütü & Paket' ? 'Ütü / Paket' : key === 'Nakış' || key === 'Baskı' ? `Uygulama · ${key}` : key} Birim Fiyatı (TL)`}><input aria-label={`${key} Birim Fiyatı`} type="number" min="0" step="0.01" value={prices[key] === undefined ? '' : prices[key]! / 100} onChange={(e) => { const next = { ...prices }; if (e.target.value === '') delete next[key]; else next[key] = Math.round(Number(e.target.value) * 100); onPrices(next); }} /></Field>)}</div>
    <Field label="Kumaş Tedarikçisi / Cari">{firms(costing.fabricCompanyId, (fabricCompanyId) => onCosting({ ...costing, fabricCompanyId }), 'Kumaş Tedarikçisi / Cari')}</Field>
    <h3>Aksesuar ve Malzemeler</h3><div className="order-accessories">{costing.accessories.map((row, index) => {
      const stock = row.materialId ? materials.find((m) => m.id === row.materialId) : undefined;
      const price = stock?.priceMinor ?? row.priceMinor;
      const total = price === undefined || row.quantity <= 0 ? undefined : Math.round(row.quantity * price);
      return <div className="order-accessory-row" key={row.id}>
        <Field label={`Aksesuar/Malzeme ${index + 1}`}><input required maxLength={200} value={stock?.name ?? row.name} onChange={(e) => updateAccessory(row.id, { name: e.target.value })} /></Field>
        <Field label="Miktar"><input readOnly value={row.quantityText ?? `${row.quantity} ${row.unit}`} /></Field>
        <Field label="Birim Fiyat (TL)"><input type="number" min="0" step="0.01" disabled={!!stock} value={price === undefined ? '' : price / 100} onChange={(e) => updateAccessory(row.id, { priceMinor: e.target.value === '' ? undefined : Math.round(Number(e.target.value) * 100) })} /></Field>
        <Field label="Toplam Tutar">{total === undefined ? '—' : costMoney(total)}</Field>
        <Field label={`Aksesuar ${index + 1} Tedarikçi`}>{firms(stock?.companyId ?? row.companyId, (companyId) => updateAccessory(row.id, { companyId }), `Aksesuar ${index + 1} Tedarikçi`, !!stock)}</Field>
        <button type="button" className="button ws-secondary compact-control" aria-label={`Aksesuar/Malzeme ${index + 1} sil`} onClick={() => onCosting({ ...costing, accessories: costing.accessories.filter((v) => v.id !== row.id) })}>−</button>
      </div>;
    })}</div><button type="button" className="button ws-secondary" disabled={costing.accessories.length >= 100} onClick={() => onCosting({ ...costing, accessories: [...costing.accessories, { id: crypto.randomUUID(), name: '', quantity: 1, quantityText: '1 adet', unit: 'Adet', materialId: '', companyId: '' }] })}>+ Aksesuar/Malzeme Ekle</button>
    <p>Aksesuar ve Malzeme Toplamı: <strong>{costMoney(accessoryTotal)}</strong></p>
    <h3>Ek Maliyetler</h3>{costing.extras.map((r, i) => <div className="order-extra-cost-row" key={r.id}>
      <Field label={`Ek Maliyet ${i + 1} Türü`}><select value={r.category} onChange={(e) => onCosting({ ...costing, extras: costing.extras.map((v) => v.id === r.id ? { ...v, category: e.target.value as typeof r.category } : v) })}>{extraCostCategories.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label={`Ek Maliyet ${i + 1} Açıklama`}><input required maxLength={200} value={r.name} onChange={(e) => onCosting({ ...costing, extras: costing.extras.map((v) => v.id === r.id ? { ...v, name: e.target.value } : v) })} /></Field>
      <Field label={`Ek Maliyet ${i + 1} Tutar (TL)`}><input required type="number" min="0" step="0.01" value={r.amountMinor / 100} onChange={(e) => onCosting({ ...costing, extras: costing.extras.map((v) => v.id === r.id ? { ...v, amountMinor: Math.round(Number(e.target.value) * 100) } : v) })} /></Field>
      <Field label={`Ek Maliyet ${i + 1} Firma`}>{firms(r.companyId, (companyId) => onCosting({ ...costing, extras: costing.extras.map((v) => v.id === r.id ? { ...v, companyId } : v) }), `Ek Maliyet ${i + 1} Firma`)}</Field>
      <Field label={`Ek Maliyet ${i + 1} Tarih`}><input required type="date" value={r.date} onChange={(e) => onCosting({ ...costing, extras: costing.extras.map((v) => v.id === r.id ? { ...v, date: e.target.value } : v) })} /></Field>
      <button type="button" className="button ws-secondary compact-control" aria-label={`Ek Maliyet ${i + 1} sil`} onClick={() => onCosting({ ...costing, extras: costing.extras.filter((v) => v.id !== r.id) })}>−</button>
    </div>)}<button type="button" className="button ws-secondary" disabled={costing.extras.length >= 100} onClick={() => onCosting({ ...costing, extras: [...costing.extras, { id: crypto.randomUUID(), category: 'Diğer', name: '', amountMinor: 0, companyId: '', date }] })}>+ Ek Maliyet Ekle</button><p>Ek maliyet toplamı: {costMoney(costing.extras.reduce((n, r) => n + r.amountMinor, 0))}</p>
  </>;
}
