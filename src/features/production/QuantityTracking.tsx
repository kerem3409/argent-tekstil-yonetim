import { latestStageResult, colorKey, stageInput, stageRecord } from '../../domain/productionPlan';
import type { PlanStage } from '../../domain/productionPlan';
import { groupResult } from '../../domain/productionPresentation';
import { stagePlan } from '../../domain/productionPlanning';
import type { ProductionOrder } from '../../domain/productionOrder';
import type { Contact } from '../contacts/model';
import { Section, companyName } from '../shared/WorkshopUI';

export function QuantityTracking({ order, contacts = [], pairedAssignments = false, compact = false }: { order: ProductionOrder; contacts?: Contact[]; pairedAssignments?: boolean; compact?: boolean }) {
  const p = order.product;
  const groups: { name: string; types: PlanStage[] }[] = [{ name: 'Kesim', types: ['Kesim'] }, { name: 'Uygulama', types: (['Uygulama', 'Nakış', 'Baskı'] as PlanStage[]).filter((s) => p.enabledStages.includes(s)) }, { name: 'Dikim', types: ['Dikim'] }, { name: 'Paket', types: ['Ütü & Paket'] }];
  const results = groups.map((g) => groupResult(p, g.types)), latest = latestStageResult(p);
  const amount = (rows: { color: string; quantity: number }[] | undefined, color?: string) => rows ? rows.filter((r) => !color || colorKey(r.color) === colorKey(color)).reduce((n, r) => n + r.quantity, 0) : undefined;
  const requested = amount(p.colors)!, completed = amount(latest?.rows);
  const fire = (color?: string) => { const cut = amount(results[0]?.rows, color), actual = amount(latest?.rows, color); return cut === undefined || actual === undefined ? '—' : Math.max(0, cut - actual); };
  const cell = (i: number, color?: string) => {
    const actual = amount(results[i]?.rows, color); if (actual === undefined) return '—';
    const initial = amount(stageInput(p, groups[i].types[0]), color), delta = initial === undefined ? 0 : actual - initial;
    if (compact) return actual;
    return `${actual}${delta ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}`;
  };
  const assignment = (date: boolean) => <ul className="quantity-assignments">{groups.filter((g) => g.types.length).map((g) => {
    const values = g.types.map((type) => {
      const plan = stagePlan(order, type);
      return { type, value: (date ? plan?.dueDate : companyName(contacts, plan?.companyId || stageRecord(p, type)?.companyId || '')) || '—' };
    });
    const same = date && values.every((v) => v.value === values[0].value);
    return <li key={g.name}><strong>{g.name}:</strong> {same ? <span className="quantity-date-value">{values[0].value}</span> : values.map((v, i) => <span key={v.type}>{i > 0 && ' / '}{values.length > 1 && `${v.type}: `}<span className={date ? 'quantity-date-value' : undefined}>{v.value}</span></span>)}</li>;
  })}</ul>;
  const paired = <div className="quantity-assignment-pairs" role="list">{groups.flatMap((g) => g.types.map((type) => {
    const plan = stagePlan(order, type), date = plan?.dueDate;
    return <div className="quantity-assignment-pair" role="listitem" key={type}><span><strong>{g.name}{g.types.length > 1 ? ` (${type})` : ''}</strong><span>{companyName(contacts, plan?.companyId || stageRecord(p, type)?.companyId || '')}</span></span><time dateTime={date}>{date ? date.split('-').reverse().join('.') : '—'}</time></div>;
  }))}</div>;
  return <div className="order-quantity-tracking"><Section title={compact ? "Renkler ve Adetler" : "Adet Tablosu"}><div className="table-scroll"><table className="ws-table quantity-sheet-table"><caption className="sr-only">Üretim adetleri, firmalar ve terminler</caption><thead><tr>{['Renk', 'Sipariş', ...groups.map((g) => g.name), 'Fire', ...(compact ? [] : ['Firma', 'Termin'])].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>
    {p.colors.map((r, i) => <tr key={r.color}><td>{r.color}</td><td>{r.quantity}</td>{groups.map((g, n) => <td key={g.name}>{cell(n, r.color)}</td>)}<td>{fire(r.color)}</td>{!compact && i === 0 && (pairedAssignments ? <td colSpan={2} rowSpan={p.colors.length} className="quantity-paired-cell">{paired}</td> : <><td rowSpan={p.colors.length} className="quantity-firms">{assignment(false)}</td><td rowSpan={p.colors.length} className="quantity-dates">{assignment(true)}</td></>)}</tr>)}
    <tr className="quantity-total"><td>TOPLAM</td><td>{requested}</td>{groups.map((g,n) => <td key={g.name}>{cell(n)}</td>)}<td>{fire()}</td>{!compact && <td colSpan={2} />}</tr>
  </tbody></table></div><p className="quantity-totals">Toplam Sipariş: <strong>{requested}</strong> · Tamamlanan Sağlam Ürün: <strong>{completed ?? '—'}</strong> · Genel Fark: <strong>{completed === undefined ? '—' : `${completed - requested > 0 ? '+' : ''}${completed - requested}`}</strong></p></Section></div>;
}
