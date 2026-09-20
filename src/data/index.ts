import { mockWorkshopRepository } from './mock/workshopRepository';
import type { WorkshopRepository } from './types';

// Gelecekte Supabase veya başka bir adaptör bu noktada seçilir.
export const workshopRepository: WorkshopRepository = mockWorkshopRepository;
