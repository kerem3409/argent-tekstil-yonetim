import { useRef, useState } from 'react';
import type { ProductionOrder } from '../../domain/productionOrder';
import { orderRepository } from '../../data/production';
import { Form, Section } from '../shared/WorkshopUI';
import { CompactNotes, FeatureCheckbox } from './ProductionOrderForm';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';

export function OrderFeatures({ order, done }: { order: ProductionOrder; done: () => void }) {
  const [editing, setEditing] = useState(false);
  const [features, setFeatures] = useState({ dropShoulder: !!order.product.dropShoulder, sideSlit: !!order.product.sideSlit, instructions: [...order.product.instructions] });
  const [dirty, setDirty] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOrderDirtyGuard(dirty, ref);
  const change = (next: Partial<typeof features>) => { setFeatures((f) => ({ ...f, ...next })); setDirty(true); };
  const cancel = () => {
    if (dirty && !window.confirm('Kaydedilmemiş ürün özellikleri değişikliklerinden vazgeçilsin mi?')) return;
    setFeatures({ dropShoulder: !!order.product.dropShoulder, sideSlit: !!order.product.sideSlit, instructions: [...order.product.instructions] });
    setDirty(false); setEditing(false);
  };
  return <div ref={ref}><Section title="Ürün Özellikleri">{editing ? <Form label="Özellikleri Kaydet" cancel={cancel}
    onSubmit={() => orderRepository.updateFeatures(order.id, order.revision, { ...features, instructions: features.instructions.map((s) => s.trim()).filter(Boolean) })}
    onDone={() => { setDirty(false); setEditing(false); done(); }}>
    <FeatureCheckbox label="Düşük Omuz" value={features.dropShoulder} onChange={(dropShoulder) => change({ dropShoulder })} />
    <FeatureCheckbox label="Yırtmaç" value={features.sideSlit} onChange={(sideSlit) => change({ sideSlit })} />
    <CompactNotes value={features.instructions} onChange={(instructions) => change({ instructions })} />
    {dirty && <p role="status">Kaydedilmemiş değişiklikler var.</p>}
  </Form> : <><ul className="feature-tags">{[...(order.product.dropShoulder ? ['Düşük Omuz'] : []), ...(order.product.sideSlit ? ['Yırtmaç'] : []), ...order.product.instructions].map((s,i)=><li key={i}>{s}</li>)}</ul>
    {!order.archived && !order.deleted && <button className="button ws-secondary" onClick={() => setEditing(true)}>Ürün Özelliklerini Düzenle</button>}
  </>}</Section></div>;
}
