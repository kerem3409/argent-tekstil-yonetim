import { useState } from 'react';
import { productRepository } from '../../data/products';
import { ProductionDialog } from '../production/ProductionDialog';
import { Field, Form, useResource } from '../shared/WorkshopUI';
import type { StockRecord } from './model';

export function StockDeletionDialog({ record, permanent, close, done }: { record: StockRecord; permanent: boolean; close: () => void; done: () => void }) {
  const configured = useResource(() => productRepository.deletionPin.configured());
  const [pin, setPin] = useState(''), [confirmation, setConfirmation] = useState(''), [verified, setVerified] = useState(false);
  const label = permanent ? 'Kalıcı Sil' : 'Çöp Kutusuna Taşı';
  return <ProductionDialog title={label} close={close}>
    <p>{record.name} · {record.brand} · {record.batch} · {record.color} · {record.quantity} adet</p>
    {configured.error && <p role="alert">{configured.error}</p>}
    {configured.data !== undefined && (verified ? <Form label={label} cancel={close} onDone={done} onSubmit={async () => {
      if (permanent) await productRepository.permanentlyDelete(record.id, pin, record.trash!.deletedAt);
      else await productRepository.trash(record.id, pin, record.quantity);
    }}>
      <p>{permanent ? 'Bu renk satırı ve ilk stok giriş hareketi kalıcı silinecek. Bu işlem geri alınamaz. Bağlı üretim, satış, cari veya ek stok hareketleri varsa silme engellenir.' : 'Yalnızca bu renk satırı Çöp Kutusuna taşınacak. Stok hareketleri ve üretim bağlantıları korunacak.'}</p>
      <Field label="Silme işlemini onaylıyorum"><input required type="checkbox" /></Field>
    </Form> : <Form label={configured.data ? 'Şifreyi Doğrula' : 'Şifreyi Belirle'} cancel={close} onDone={() => {
      if (configured.data) setVerified(true);
      else { setPin(''); setConfirmation(''); configured.reload(); }
    }} onSubmit={async () => {
      if (configured.data) await productRepository.deletionPin.verify(pin);
      else await productRepository.deletionPin.setup(pin, confirmation);
    }}>
      <Field label={configured.data ? 'Şifre / PIN' : 'Yeni Şifre / PIN'}><input required type="password" autoComplete={configured.data ? 'current-password' : 'new-password'} minLength={configured.data ? undefined : 6} maxLength={128} value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
      {!configured.data && <Field label="Şifre / PIN Tekrar"><input required type="password" autoComplete="new-password" maxLength={128} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></Field>}
    </Form>)}
  </ProductionDialog>;
}
