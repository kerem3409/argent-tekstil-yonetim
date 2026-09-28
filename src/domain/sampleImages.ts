export interface SampleImage { id: string; name: string; dataUrl: string }
export const MAX_SAMPLE_IMAGES = 3;
export const MAX_SAMPLE_DATA_LENGTH = 100_000;
export function validateSampleImages(images: SampleImage[] | undefined) {
  if (images === undefined) return;
  if (!Array.isArray(images) || images.length > MAX_SAMPLE_IMAGES || images.some((i) => !i || typeof i.id !== 'string' || !i.id || typeof i.name !== 'string' || i.name.length > 200 || typeof i.dataUrl !== 'string' || i.dataUrl.length > MAX_SAMPLE_DATA_LENGTH || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(i.dataUrl)) || new Set(images.map((i) => i.id)).size !== images.length) throw new Error('En fazla 3 geçerli, sıkıştırılmış numune görseli eklenebilir.');
}
