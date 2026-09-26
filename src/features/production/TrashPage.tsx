import { Link } from 'react-router-dom';
import { workflowRepository } from '../../data/production';
import { productionDisplayName, productionOrderId } from '../../domain/productionWorkflow';
import { Page, Section, Table, useResource } from '../shared/WorkshopUI';
import { RecordActions } from './RecordActions';
import './production.css';

export function TrashPage() {
  const resource = useResource(async () => ({ cuts: await workflowRepository.listCuttingOrders(), orders: await workflowRepository.listOrders(), productions: await workflowRepository.list() }));
  return <Page title="Çöp Kutusu" error={resource.error} loading={!resource.data} reload={resource.reload}>
    <p className="ws-hint">Kayıtlar kalıcı olarak silinmez. Geri yüklemede tahsisler kontrol edilir. Önceden arşivde olan kayıtlar arşive geri döner.</p>
    <Section title="Silinen Sipariş Kartları"><Table headers={['Sipariş No', 'Silinme Zamanı', 'Bağlı Üretimler', 'İşlem']} rows={(resource.data?.orders ?? []).filter((o) => o.deleted).map((o) => [<Link to={`/uretim/siparisler?id=${o.id}`}>{o.orderNo}</Link>, o.deletedAt, o.productionCardIds.length, <RecordActions kind="order" record={o} done={resource.reload} />])} /></Section>
    <Section title="Silinen Kesim Emirleri"><p>Bağlı sipariş geri yüklendiğinde kesim emirleri de geri yüklenir.</p><Table headers={['Kesim Emri No', 'Ürün', 'Silinme Zamanı']} rows={(resource.data?.cuts ?? []).filter((c) => c.deleted).map((c) => [<Link to={`/uretim/kesim-takibi?id=${c.id}`}>{c.cuttingNo}</Link>, c.modelName, c.deletedAt])} /></Section>
    <Section title="Silinen Üretim Kartları"><Table headers={['Üretim No', 'Üretim Adı', 'Sipariş', 'Silinme Zamanı', 'İşlem']} rows={(resource.data?.productions ?? []).filter((p) => p.deleted).map((p) => [<Link to={`/uretim/takip?id=${p.id}`}>{p.productionNo}</Link>, productionDisplayName(p), resource.data?.orders.find((o) => o.id === productionOrderId(p))?.orderNo ?? '—', p.deletedAt, <RecordActions kind="production" record={p} done={resource.reload} />])} /></Section>
  </Page>;
}
