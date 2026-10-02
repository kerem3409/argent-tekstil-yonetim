import { useRef, useState } from 'react';
import type { ProductionOrder } from '../../domain/productionOrder';
import { orderRepository } from '../../data/production';
import { Form, Section } from '../shared/WorkshopUI';
import { CompactNotes } from './ProductionOrderForm';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';

export function OrderFeatures({ order, done }: { order: ProductionOrder; done: () => void }) {
  const [editing, setEditing] = useState(false);
  const legacy = [...(order.product.dropShoulder ? ['Düşük Omuz'] : []), ...(order.product.sideSlit ? ['Yırtmaç'] : [])];
  const currentInstructions = [...order.product.instructions];
  for (const value of legacy) if (!currentInstructions.includes(value)) currentInstructions.unshift(value);
  const [instructions, setInstructions] = useState(currentInstructions);
  const [dirty, setDirty] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOrderDirtyGuard(dirty, ref);
  const change = (next: string[]) => { setInstructions(next); setDirty(true); };
  const cancel = () => {
    if (dirty && !window.confirm('Kaydedilmemiş ürün özellikleri değişikliklerinden vazgeçilsin mi?')) return;
    setInstructions(currentInstructions);
    setDirty(false); setEditing(false);
  };
  return <div ref={ref}><Section title="Ürün Özellikleri">{editing ? <Form label="Özellikleri Kaydet" cancel={cancel}
    onSubmit={() => orderRepository.updateFeatures(order.id, order.revision, { dropShoulder: false, sideSlit: false, instructions: instructions.map((s) => s.trim()).filter(Boolean) })}
    onDone={() => { setDirty(false); setEditing(false); done(); }}>
    <CompactNotes title="Özellik" value={instructions} onChange={change} />
    {dirty && <p role="status">Kaydedilmemiş değişiklikler var.</p>}
  </Form> : <><ul className="feature-tags">{currentInstructions.map((s,i)=><li key={i}>{s}</li>)}</ul>
    {!order.archived && !order.deleted && <button className="button ws-secondary" onClick={() => setEditing(true)}>Ürün Özelliklerini Düzenle</button>}
  </>}</Section></div>;
}
