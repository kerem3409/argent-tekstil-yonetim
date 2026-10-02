import { useRef, useState } from 'react';
import { productApplicationCards } from '../../domain/productionOrder';
import type { ApplicationCard, ProductionOrder } from '../../domain/productionOrder';
import { orderRepository } from '../../data/production';
import { Field, Form } from '../shared/WorkshopUI';
import { CompactNotes } from './ProductionOrderForm';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';

export function DecorationEditor({ order, done }: { order: ProductionOrder; done: () => void }) {
  const p = order.product;
  const [cards, setCards] = useState<ApplicationCard[]>(() => structuredClone(productApplicationCards(p)));
  const [dirty, setDirty] = useState(false), ref = useRef<HTMLDivElement>(null); useOrderDirtyGuard(dirty, ref);
  const locked = !!p.stockTransfer || p.stages.some((s) => ['Nakış', 'Baskı', 'Dikim', 'Ütü & Paket'].includes(s.type));
  const change = (next: ApplicationCard[]) => { setCards(next); setDirty(true); };
  return <div ref={ref}><Form label="Baskı - Nakış Bilgilerini Kaydet" onDone={() => { setDirty(false); done(); }} onSubmit={() => orderRepository.saveApplicationCards(order.id, order.revision, cards)}>
    {cards.map((card, index) => <div className="application-operation-fields" key={card.id}>
      <div className="application-card-heading"><Field label={`İşlem ${index + 1} Türü`}><select disabled={locked} value={card.type} onChange={(e) => change(cards.map((v) => v.id === card.id ? { ...v, type: e.target.value as ApplicationCard['type'] } : v))}><option>Baskı</option><option>Nakış</option></select></Field><button type="button" className="button ws-secondary compact-control" disabled={locked} aria-label={`İşlem ${index + 1} sil`} onClick={() => change(cards.filter((v) => v.id !== card.id))}>−</button></div>
      <CompactNotes title={`${card.type} Açıklaması`} value={card.notes} onChange={(notes) => change(cards.map((v) => v.id === card.id ? { ...v, notes } : v))} />
    </div>)}
    <button type="button" className="button ws-secondary" disabled={locked || cards.length >= 50} onClick={() => change([...cards, { id: crypto.randomUUID(), type: 'Baskı', notes: [''] }])}>+ İşlem Ekle</button>
  </Form></div>;
}
