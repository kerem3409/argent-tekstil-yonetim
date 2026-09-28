import { useState } from 'react';
import { ProductionDialog } from './ProductionDialog';

export function GeneralSheetPrint() {
  const [open, setOpen] = useState(false), [includeCosts, setIncludeCosts] = useState(false);
  return <><button className="button" onClick={() => { setIncludeCosts(false); setOpen(true); }}>Yazdır / PDF</button>{open && <ProductionDialog title="Çıktı Seçenekleri" close={() => setOpen(false)}>
    <fieldset><legend>Maliyet bilgileri çıktıya eklensin mi?</legend>{[false, true].map((value) => <label className="print-cost-choice" key={String(value)}><input type="radio" name="printCosts" checked={includeCosts === value} onChange={() => setIncludeCosts(value)} />{value ? 'Evet' : 'Hayır'}</label>)}</fieldset>
    <button className="button" onClick={() => {
      setOpen(false);
      // Permission is scoped to this print call; Ctrl+P and subsequent prints default to private.
      document.documentElement.dataset.generalSheetPrintCosts = includeCosts ? 'yes' : 'no';
      try { window.print(); } finally { delete document.documentElement.dataset.generalSheetPrintCosts; }
    }}>Çıktıyı Aç</button> <button className="button ws-secondary" onClick={() => setOpen(false)}>Vazgeç</button>
  </ProductionDialog>}</>;
}
