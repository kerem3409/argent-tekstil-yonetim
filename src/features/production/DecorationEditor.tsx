import { useRef, useState } from 'react';
import { emptyEmbroidery } from '../../domain/productionOrder';
import type { ProductionOrder } from '../../domain/productionOrder';
import { orderRepository } from '../../data/production';
import { Field, Form } from '../shared/WorkshopUI';
import { CompactNotes } from './ProductionOrderForm';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';

export function DecorationEditor({ order, done }: { order: ProductionOrder; done: () => void }) {
  const p = order.product;
  const [types, setTypes] = useState((['Nakış', 'Baskı'] as const).filter((t) => p.enabledStages.includes(t)));
  const [info, setInfo] = useState({ Nakış: p.embroidery, Baskı: p.printing ?? emptyEmbroidery() });
  const [dirty, setDirty] = useState(false), ref = useRef<HTMLDivElement>(null); useOrderDirtyGuard(dirty, ref);
  const locked = !!p.stockTransfer || p.stages.some((s) => ['Nakış', 'Baskı', 'Dikim', 'Ütü & Paket'].includes(s.type));
  return <div ref={ref} onChangeCapture={() => setDirty(true)}><Form label="İşlem Bilgilerini Kaydet" onDone={() => { setDirty(false); done(); }} onSubmit={() => orderRepository.saveDecoration(order.id, order.revision, types, info.Nakış, info.Baskı)}>
    <Field label="İşlem Türü"><select aria-label="İşlem Türü" disabled={locked} value={types.length === 2 ? 'İkisi de' : types[0] ?? 'Yok'} onChange={(e) => setTypes(e.target.value === 'İkisi de' ? ['Nakış', 'Baskı'] : e.target.value === 'Yok' ? [] : [e.target.value as 'Nakış' | 'Baskı'])}>{['Yok', 'Nakış', 'Baskı', 'İkisi de'].map((t) => <option key={t}>{t}</option>)}</select></Field>
    {types.map((type) => <div key={type}><h4>{type}</h4><div className="ws-grid">{(['position', 'size', 'color'] as const).map((key) => <Field key={key} label={`${type} ${{ position: 'Konum', size: 'Ölçü', color: 'Renk' }[key]}`}><input maxLength={key === 'color' ? 200 : 2000} value={info[type][key] ?? ''} onChange={(e) => setInfo((v) => ({ ...v, [type]: { ...v[type], [key]: e.target.value } }))} /></Field>)}</div><CompactNotes title={`${type} Açıklama`} value={info[type].notes} onChange={(notes) => { setInfo((v) => ({ ...v, [type]: { ...v[type], notes } })); setDirty(true); }} /></div>)}
  </Form></div>;
}
