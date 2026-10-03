import { useRef, useState } from 'react';
import { productApplicationCards } from '../../domain/productionOrder';
import type { ApplicationCard, ProductionOrder } from '../../domain/productionOrder';
import { orderRepository } from '../../data/production';
import { Field, Form } from '../shared/WorkshopUI';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';

export function DecorationEditor({ order, done }: { order: ProductionOrder; done: () => void }) {
  const p = order.product;
  const [cards, setCards] = useState<ApplicationCard[]>(() => structuredClone(productApplicationCards(p)));
  const [dirty, setDirty] = useState(false), ref = useRef<HTMLDivElement>(null); useOrderDirtyGuard(dirty, ref);
  const locked = !!p.stockTransfer || p.stages.some((s) => ['Nakış', 'Baskı', 'Dikim', 'Ütü & Paket'].includes(s.type));
  const change = (next: ApplicationCard[]) => { setCards(next); setDirty(true); };
  return <div ref={ref}><Form label="Baskı - Nakış Bilgilerini Kaydet" onDone={() => { setDirty(false); done(); }} onSubmit={() => orderRepository.saveApplicationCards(order.id, order.revision, cards)}>
    {cards.map((card, index) => <div className="application-operation-fields" key={card.id}><Field label={`İşlem ${index + 1} Adı`}><input maxLength={200} disabled={locked} value={card.name ?? card.type} onChange={(e) => { const name = e.target.value; const type = /nakış|nakis/i.test(name) ? 'Nakış' as const : 'Baskı' as const; change(cards.map((v) => v.id === card.id ? { ...v, name, type } : v)); }} /></Field><Field label="Açıklama"><textarea maxLength={2000} value={card.notes.join('\n')} onChange={(e) => change(cards.map((v) => v.id === card.id ? { ...v, notes: e.target.value.split('\n') } : v))} /></Field><button type="button" className="button ws-secondary compact-control" disabled={locked} aria-label={`İşlem ${index + 1} sil`} onClick={() => { change(cards.filter((v) => v.id !== card.id)); }}>−</button></div>)}
    <button type="button" className="button ws-secondary compact-control" aria-label="İşlem ekle" disabled={locked || cards.length >= 50} onClick={() => change([...cards, { id: crypto.randomUUID(), type: 'Baskı', notes: [''] }])}>+</button>
  </Form></div>;
}
