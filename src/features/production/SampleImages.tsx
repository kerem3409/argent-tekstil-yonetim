import { useState } from 'react';
import type { SampleImage } from '../../domain/sampleImages';
import { MAX_SAMPLE_DATA_LENGTH, validateSampleImages } from '../../domain/sampleImages';
import { ProductionDialog } from './ProductionDialog';

export async function prepareSampleImage(file: File): Promise<SampleImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('JPEG, PNG veya WebP fotoğraf seçin (en fazla 20 MB).');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const canvas = document.createElement('canvas'); let side = 800, dataUrl = '';
    do {
      const ratio = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Görsel işlenemedi.');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL('image/jpeg', 0.72); side = Math.floor(side * 0.75);
    } while (dataUrl.length > MAX_SAMPLE_DATA_LENGTH && side >= 100);
    const result = { id: crypto.randomUUID(), name: file.name.slice(0, 200), dataUrl }; validateSampleImages([result]); return result;
  } catch (e) { throw new Error(e instanceof Error && e.message.includes('görsel') ? e.message : 'Fotoğraf okunamadı. Geçerli bir görsel seçin.'); }
  finally { URL.revokeObjectURL(url); }
}

export function SampleImages({ images = [], onChange, disabled = false, onBusy }: { images?: SampleImage[]; onChange?: (images: SampleImage[]) => void; disabled?: boolean; onBusy?: (busy: boolean) => void }) {
  const [large, setLarge] = useState<SampleImage>(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function upload(files: FileList | null, index?: number) {
    if (!files?.length || busy || disabled) return;
    if (index === undefined && files.length + images.length > 3) { setError('En fazla 3 numune görseli ekleyebilirsiniz.'); return; }
    setBusy(true); onBusy?.(true); setError('');
    try { const prepared = await Promise.all([...files].map(prepareSampleImage)); const next = index === undefined ? [...images, ...prepared] : images.map((v, i) => i === index ? prepared[0] : v); validateSampleImages(next); onChange?.(next); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); onBusy?.(false); }
  }
  return <div className="sample-images"><div className="sample-thumbnails">{images.map((img, i) => <div className="sample-thumbnail" key={img.id}><button type="button" className="sample-preview" aria-label={`Numune ${i + 1} büyüt`} onClick={() => setLarge(img)}><img src={img.dataUrl} alt={`Numune ${i + 1}: ${img.name}`} /></button>{onChange && <div className="sample-controls production-screen-only"><label>Değiştir<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Numune ${i + 1} değiştir`} disabled={busy || disabled} onChange={(e) => { void upload(e.target.files, i); e.target.value = ''; }} /></label><button type="button" disabled={busy || disabled} aria-label={`Numune ${i + 1} kaldır`} onClick={() => onChange(images.filter((_, n) => i !== n))}>×</button></div>}</div>)}</div>
    {onChange && images.length < 3 && <label className="sample-upload production-screen-only">+ Görsel Ekle<input type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Numune görselleri ekle" disabled={busy || disabled} onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} /></label>}
    {busy && <p role="status">Görseller hazırlanıyor…</p>}{error && <p role="alert">{error}</p>}
    {large && <ProductionDialog title="Numune Görseli" close={() => setLarge(undefined)}><img className="sample-large" src={large.dataUrl} alt={large.name} /><button type="button" className="button ws-secondary" onClick={() => setLarge(undefined)}>Kapat</button></ProductionDialog>}
  </div>;
}
