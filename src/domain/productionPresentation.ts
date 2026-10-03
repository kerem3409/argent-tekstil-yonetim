import { activeStages, stageRecord } from './productionPlan.ts';
import type { PlanItem, PlanStage } from './productionPlan';

export const displayStage = (stage: string) => stage === 'Nakış' || stage === 'Baskı' ? 'Uygulama' : stage === 'Ütü & Paket' ? 'Paket' : stage;
export function stageGroups(product: PlanItem) {
  const groups: { name: string; types: PlanStage[] }[] = [];
  for (const type of activeStages(product)) {
    const name = displayStage(type), previous = groups.find((g) => g.name === name);
    if (previous) previous.types.push(type); else groups.push({ name, types: [type] });
  }
  return groups;
}
export function groupResult(product: PlanItem, types: PlanStage[]) {
  return [...types].reverse().map((type) => stageRecord(product, type)?.result).find(Boolean);
}
