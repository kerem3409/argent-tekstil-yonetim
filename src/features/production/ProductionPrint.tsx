import type { ProductionRecord } from '../../domain/productionWorkflow';
import { cuttingTotal, sizeSeries, stageRemainingQuantity } from '../../domain/productionWorkflow';

export function ProductionPrint({ production: p, kind, companyName }: { production: ProductionRecord; kind: 'cutting' | 'tracking'; companyName: (id: string) => string }) {
  return <article className="production-paper" aria-label={kind === 'cutting' ? 'Kesim Föyü' : 'Üretim Takip Föyü'}>
    <header><strong>ARGENT TEKSTİL</strong><h1>{kind === 'cutting' ? 'Kesim Föyü' : 'Üretim Takip Föyü'}</h1></header>
    <dl className="production-paper-info">{[['Üretim No', p.productionNo], ['Tarih', p.date], ['Ürün / Model', p.productName], ['Kumaş', p.fabricName || '—'], ['Gramaj', p.gsm || '—'], ['Beden Serisi', p.legacy?.missingSizes && !p.sizeDistributions.length ? 'Eski kayıtta belirtilmemiş' : p.sizeSeries], ['Kesimci / Atölye', companyName(p.cutterCompanyId)], ['Kesim Şekli', p.cuttingMode === 'Hedef Adet' ? `Hedef: ${p.targetQuantity} adet` : p.cuttingMode]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    <p><strong>Ürün Detayı / Talimat:</strong> {p.productInstructions || '—'}</p>
    {p.note && <p><strong>Not:</strong> {p.note}</p>}
    {p.cuttingSheet.brandSections.map((b) => <table key={b.id} className="production-paper-table"><thead><tr><th className="production-brand" colSpan={4}>{b.brandName}</th></tr><tr><th>Renk</th><th>Top Sayısı</th><th>Kg</th><th>{kind === 'tracking' ? 'Kesimden Çıkan Adet' : 'Adet'}</th></tr></thead><tbody>{b.rows.map((r) => <tr key={r.id}><td>{r.color}</td><td>{r.rollCount ?? '—'}</td><td>{r.kg ?? <span className="handwriting-space"> </span>}</td><td>{r.quantity ?? <span className="handwriting-space"> </span>}</td></tr>)}</tbody></table>)}
    {p.cuttingSheet.completedAt && <p><strong>Toplam Kesim Adedi: {cuttingTotal(p)}</strong></p>}
    {kind === 'tracking' && <><h2>Beden Dağılımı</h2>{p.cuttingSheet.brandSections.map((b) => <table key={b.id} className="production-paper-table"><thead><tr><th className="production-brand" colSpan={sizeSeries[p.sizeSeries].length + 2}>{b.brandName}</th></tr><tr><th>Renk</th>{sizeSeries[p.sizeSeries].map((s) => <th key={s}>{s}</th>)}<th>Toplam</th></tr></thead><tbody>{b.rows.map((r) => { const d = p.sizeDistributions.find((d) => d.rowId === r.id); return <tr key={r.id}><td>{r.color}</td>{sizeSeries[p.sizeSeries].map((s) => <td key={s}>{d ? d.sizes[s] ?? 0 : '—'}</td>)}<td>{d ? Object.values(d.sizes).reduce((a, b) => a + b, 0) : '—'}</td></tr>; })}</tbody></table>)}
      <h2>Üretim Aşama Takibi</h2><table className="production-paper-table production-stage-paper"><thead><tr>{['İşlem', 'Atölye', 'Gönderilen', 'Gelen', 'Kalan', 'Tarih', 'Not'].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{p.productionStages.filter((s) => s.processType !== 'Kesim').map((s) => <tr key={s.id}><td>{s.processType}</td><td>{companyName(s.companyId)}</td><td>{s.sentQuantity}</td><td>{s.returnedQuantity}</td><td>{stageRemainingQuantity(s)}</td><td>{s.sentDate}{s.returnDate && <><br />{s.returnDate}</>}</td><td>{s.note}</td></tr>)}{!p.productionStages.some((s) => s.processType !== 'Kesim') && <tr><td colSpan={7} className="handwriting-space"> </td></tr>}</tbody></table>
      {p.completion && <p>Sağlam: {p.completion.good} · Fire / Hatalı: {p.completion.waste} · {p.completion.date} · {p.completion.note}</p>}
    </>}
    <footer>Teslim Eden: ____________________ &nbsp; Teslim Alan: ____________________</footer>
  </article>;
}
