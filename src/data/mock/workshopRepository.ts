import type { TableRecord, WorkshopRepository } from '../types';

// İlk aşamada boş yerel veri. Modüller geliştikçe örnek kayıtlar eklenebilir.
const records: Record<string, TableRecord[]> = {};

export const mockWorkshopRepository: WorkshopRepository = {
  async listRecords(moduleId) {
    return (records[moduleId] ?? []).map((record) => ({ ...record, cells: [...record.cells] }));
  },
};
