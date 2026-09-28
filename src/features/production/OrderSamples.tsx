import { useRef, useState } from 'react';
import type { ProductionOrder } from '../../domain/productionOrder';
import { SampleImages } from './SampleImages';
import { orderRepository } from '../../data/production';
import { Form } from '../shared/WorkshopUI';
import { useOrderDirtyGuard } from './useOrderDirtyGuard';

export function OrderSamples({ order, done }: { order: ProductionOrder; done: () => void }) {
  const [editing, setEditing] = useState(false), [images, setImages] = useState(order.product.sampleImages ?? []), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const ref = useRef<HTMLDivElement>(null); useOrderDirtyGuard(dirty, ref);
  return <aside className="order-samples" ref={ref}><h3>Numune Görselleri</h3>{editing ? <div className="production-screen-only"><Form label="Görselleri Kaydet" onSubmit={async () => { if (busy) throw new Error('Görsellerin hazırlanmasını bekleyin.'); await orderRepository.saveSampleImages(order.id, order.revision, images); }} onDone={() => { setDirty(false); setEditing(false); done(); }} cancel={() => { if (dirty && !window.confirm('Görsel değişikliklerinden vazgeçilsin mi?')) return; setImages(order.product.sampleImages ?? []); setDirty(false); setEditing(false); }}><SampleImages images={images} onBusy={setBusy} onChange={(next) => { setImages(next); setDirty(true); }} /></Form></div> : <><SampleImages images={order.product.sampleImages} />{!order.product.sampleImages?.length && <p className="ws-hint">Görsel eklenmedi</p>}{!order.archived && !order.deleted && <button type="button" className="button ws-secondary production-screen-only" onClick={() => setEditing(true)}>Görselleri Düzenle</button>}</>}{editing && <div className="production-print-only"><SampleImages images={order.product.sampleImages} /></div>}</aside>;
}
