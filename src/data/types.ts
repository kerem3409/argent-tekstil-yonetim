export type TableRecord = { id: string; cells: string[] };

// Adaptörler bu sözleşmeyi uygular. Arayüz doğrudan veri kaynağına bağlanmaz.
export interface WorkshopRepository {
  listRecords(moduleId: string): Promise<TableRecord[]>;
}
