import type { TableRecord } from '../data/types';
import { Icon } from './Icon';

export function DataTable({ columns, records, title }: { columns: string[]; records: TableRecord[]; title: string }) {
  return <div className="table-scroll"><table>
    <caption className="sr-only">{title}</caption>
    <thead><tr>{columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
    <tbody>{records.length ? records.map((record) => <tr key={record.id}>{record.cells.map((cell, i) => <td key={i}>{cell}</td>)}</tr>) : <tr><td colSpan={columns.length}><div className="empty-state"><span className="empty-icon"><Icon name="empty" size={26} /></span><h3>Henüz kayıt bulunmuyor</h3><p>Bu modüle ait kayıtlar burada listelenecek.</p></div></td></tr>}</tbody>
  </table></div>;
}
