// Lưu trữ đối chiếu sổ kho ở phía máy chủ (chỉ dùng trong route /api/doichieu).
// Dữ liệu nằm trong kho lưu trữ sku-data của Supabase, thư mục doichieu/:
//  - doichieu/config.json        cài đặt, danh sách nhân sự, bộ/combo, danh mục mã, danh sách tháng đã có dữ liệu
//  - doichieu/phien-YYYY-MM.json các ngày đã lưu của tháng đó (mỗi ngày một phiên đối chiếu)
// (đọc/ghi qua storage-server.ts: máy chủ gửi kèm x-db-key để sau này khóa được thư mục này bằng supabase-doichieu-lock.sql)

import { readJson, writeJson } from './storage-server';
import { dcDefaultConfig } from './doichieu';
import type { DcConfig, DcSession, DcBo, DcSettings } from './doichieu';

const CONFIG_PATH = 'doichieu/config.json';
const monthPath = (m: string) => 'doichieu/phien-' + m + '.json';
export const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export const isDay = (d: string) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d);

export async function dcGetConfig(): Promise<DcConfig> {
  const def = dcDefaultConfig();
  const j = await readJson<Partial<DcConfig>>(CONFIG_PATH);
  if (!j) return def;
  return {
    settings: Object.assign({}, def.settings, j.settings || {}),
    bo: j.bo || [],
    combos: j.combos || [],
    catalog: j.catalog || [],
    months: j.months || [],
  };
}

export interface DcConfigPatch { settings?: DcSettings; bo?: DcBo[]; combos?: Array<[string, string]>; catalog?: Array<[string, string]> }

async function putConfig(cfg: DcConfig): Promise<void> {
  cfg.months = Array.from(new Set(cfg.months)).sort();
  await writeJson(CONFIG_PATH, cfg);
}

// Đọc bản mới nhất -> áp thay đổi -> ghi lại, để không đè thay đổi của người khác vừa lưu
export async function dcSaveConfig(patch: DcConfigPatch): Promise<DcConfig> {
  const cur = await dcGetConfig();
  if (patch.settings) cur.settings = patch.settings;
  if (patch.bo) cur.bo = patch.bo;
  if (patch.combos) cur.combos = patch.combos;
  if (patch.catalog) cur.catalog = patch.catalog;
  await putConfig(cur);
  return cur;
}

export async function dcGetMonth(month: string): Promise<DcSession[]> {
  const j = await readJson<{ sessions?: DcSession[] }>(monthPath(month));
  return (j && j.sessions) || [];
}

export async function dcSaveSessions(list: DcSession[]): Promise<void> {
  const byMonth: Record<string, DcSession[]> = {};
  list.forEach(function(s) { (byMonth[s.ngay.slice(0, 7)] = byMonth[s.ngay.slice(0, 7)] || []).push(s); });
  const months = Object.keys(byMonth);
  for (const m of months) {
    const cur = await dcGetMonth(m);
    const keep = cur.filter(function(c) { return !byMonth[m].some(function(n) { return n.ngay === c.ngay; }); });
    const all = keep.concat(byMonth[m]).sort(function(a, b) { return b.ngay.localeCompare(a.ngay); });
    await writeJson(monthPath(m), { month: m, sessions: all });
  }
  const cfg = await dcGetConfig();
  cfg.months = cfg.months.concat(months);
  await putConfig(cfg);
}

export async function dcDeleteSessions(days: string[]): Promise<number> {
  const byMonth: Record<string, string[]> = {};
  days.forEach(function(d) { (byMonth[d.slice(0, 7)] = byMonth[d.slice(0, 7)] || []).push(d); });
  let n = 0;
  for (const m of Object.keys(byMonth)) {
    const cur = await dcGetMonth(m);
    const next = cur.filter(function(c) { return byMonth[m].indexOf(c.ngay) < 0; });
    n += cur.length - next.length;
    if (next.length !== cur.length) await writeJson(monthPath(m), { month: m, sessions: next });
  }
  return n;
}
