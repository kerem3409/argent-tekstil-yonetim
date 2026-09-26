import type { ProductionOrderCard, ProductionRecord } from '../../domain/productionWorkflow';
import { productionDisplayName, cuttingTotal, stageRemainingQuantity } from '../../domain/productionWorkflow';
import { CommonSizes } from './CommonSizes';

export function ProductionPrint({ production: p, order, kind, companyName }: { production: ProductionRecord; order?: ProductionOrderCard; kind: 'cutting' | 'tracking'; companyName: (id: string) => string }) {
  const item = order?.items.find((item) => item.id === p.orderItemId);
  // The request uses reserved quantities; historical actual quantities are never substituted.
  const requested = p.selectedColorQuantities?.length ? p.selectedColorQuantities : p.cuttingSheet.brandSections.flatMap((b) => b.rows.map((r) => ({ color: r.color, quantity: null })));
  const title = kind === 'cutting' ? 'Kesime Föy' : 'Üretim Takip Föyü';
  return <article className="production-paper" aria-label={title}>
    <header><strong>ARGENT TEKSTİL</strong><h1>{title}</h1></header>
    <h2>Üst Bilgiler</h2>
    <dl className="production-paper-info">{[
      ['Üretim No', p.productionNo], ['Üretim Adı', productionDisplayName(p)], ['Sipariş No', order?.orderNo ?? '—'],
      ['Müşteri', order?.customerId ? companyName(order.customerId) : '—'], ['Tarih', p.date],
      ['Marka', p.brand ?? p.cuttingSheet.brandSections.map((b) => b.brandName).join(' / ')],
      ['Ürün Tanımı', item?.productName ?? p.productName], ['Ürün / Model', p.modelName ?? p.productName],
      ['Kesimci / Atölye', companyName(p.cutterCompanyId)],
    ].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl>
    <h2>Kumaş</h2>
    <dl className="production-paper-info">{[['Kumaş Adı', p.fabricName], ['Gramaj', p.gsm], ['Kumaş Özellikleri', p.fabricProperties]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl>
    {kind === 'cutting' && <>
      <h2>Üretim Talebi</h2>
      <table className="production-paper-table production-request-table"><thead><tr><th>Renk</th><th>İstenen Adet</th></tr></thead><tbody>{requested.map((r, i) => <tr key={i}><td>{r.color}</td><td>{r.quantity ?? 'Eski kayıtta belirtilmemiş'}</td></tr>)}</tbody></table>
    </>}
    <h2>Ortak Beden Serisi / Pastal Dağılımı</h2>
    <p>Beden Serisi: {p.sizeSeries} · Tüm renklere ortak uygulanır.</p>
    <CommonSizes production={p} />
    <p><strong>Ürün Detayı / Talimat:</strong> {p.productInstructions || '—'}</p>
    {p.note && <p><strong>Üretim / Kesim Notu:</strong> {p.note}</p>}
    {kind === 'cutting' ? <>
      <h2>Kesim Sonucu</h2>
      <p>Kesim tamamlandıktan sonra kesimci tarafından doldurulur.</p>
      <table className="production-paper-table cutting-results"><thead><tr><th>Renk</th><th>Top Sayısı</th><th>Kg</th><th>Çıkan Adet</th></tr></thead><tbody>{requested.map((r, i) => <tr key={i}><td>{r.color}</td>{['rolls', 'kg', 'quantity'].map((key) => <td key={key}><span className="handwriting-space"> </span></td>)}</tr>)}</tbody></table>
    </> : <>
      {p.cuttingSheet.brandSections.map((b) => <table key={b.id} className="production-paper-table"><thead><tr><th className="production-brand" colSpan={4}>{b.brandName}</th></tr><tr><th>Renk</th><th>Top Sayısı</th><th>Kg</th><th>Kesimden Çıkan Adet</th></tr></thead><tbody>{b.rows.map((r) => <tr key={r.id}><td>{r.color}</td><td>{r.rollCount ?? '—'}</td><td>{r.kg ?? '—'}</td><td>{r.quantity ?? '—'}</td></tr>)}</tbody></table>)}
      {p.cuttingSheet.completedAt && <p><strong>Toplam Kesim Adedi: {cuttingTotal(p)}</strong></p>}
      <h2>Üretim Aşama Takibi</h2><table className="production-paper-table production-stage-paper"><thead><tr>{['İşlem', 'Atölye', 'Gönderilen', 'Gelen', 'Kalan', 'Tarih', 'Not'].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{p.productionStages.filter((s) => s.processType !== 'Kesim').map((s) => <tr key={s.id}><td>{s.processType}</td><td>{companyName(s.companyId)}</td><td>{s.sentQuantity}</td><td>{s.returnedQuantity}</td><td>{stageRemainingQuantity(s)}</td><td>{s.sentDate}{s.returnDate && <><br />{s.returnDate}</>}</td><td>{s.note}</td></tr>)}{!p.productionStages.some((s) => s.processType !== 'Kesim') && <tr><td colSpan={7} className="handwriting-space"> </td></tr>}</tbody></table>
      {p.completion && <p>Sağlam: {p.completion.good} · Fire / Hatalı: {p.completion.waste} · {p.completion.date} · {p.completion.note}</p>}
    </>}
    <footer>Teslim Eden: ____________________ &nbsp; Teslim Alan: ____________________</footer>
  </article>;
}