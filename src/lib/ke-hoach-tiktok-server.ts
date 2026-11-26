// Kế hoạch TikTok theo tháng lưu trong kho sku-data: kehoach-tiktok/YYYY-MM.json (chỉ admin truy cập qua /api/ke-hoach-tiktok).

import { readJson, writeJson } from './storage-server';
import type { KhPlan } from './ke-hoach-tiktok';

const path = function(month: string): string { return 'kehoach-tiktok/' + month + '.json'; };

export const khIsMonth = function(m: string): boolean { return /^\d{4}-(0[1-9]|1[0-2])$/.test(m); };

export async function khGetPlan(month: string): Promise<KhPlan | null> {
  const j = await readJson<{ plan?: KhPlan }>(path(month));
  return (j && j.plan) || null;
}

export async function khSavePlan(plan: KhPlan): Promise<void> {
  await writeJson(path(plan.month), { plan: plan });
}
