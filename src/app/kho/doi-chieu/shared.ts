import type { DcRow, DcSession, DcConfig, DcCatalog } from '@/lib/doichieu';

export type UiRow = DcRow & { id: number };

var seq = 0;
export function newUiRow(r?: Partial<DcRow>): UiRow {
  seq++;
  return {
    id: seq,
    ma: (r && r.ma) || '',
    ns: (r && r.ns) || {},
    v: (r && r.v) || { nhap: 0, loiNhap: 0, loiTra: 0, loiNs: 0 },
    unsure: !!(r && r.unsure),
    note: (r && r.note) || '',
    goiY: (r && r.goiY) || null,
  };
}

export function catalogFromConfig(cfg: DcConfig): DcCatalog {
  var out: DcCatalog = {};
  cfg.catalog.forEach(function(c) { out[String(c[0]).toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-')] = { ma: c[0], ten: c[1] }; });
  return out;
}

export function monthOf(day: string): string { return day.slice(0, 7); }

export function allSessions(byMonth: Record<string, DcSession[]>): DcSession[] {
  var out: DcSession[] = [];
  Object.keys(byMonth).forEach(function(m) { byMonth[m].forEach(function(s) { out.push(s); }); });
  return out.sort(function(a, b) { return b.ngay.localeCompare(a.ngay); });
}

export var inputCls = 'px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none';
export var cardCls = 'bg-slate-900 border border-slate-700 rounded-xl p-4 mb-4';
export var btnCls = 'px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-gray-200 text-sm rounded-lg disabled:opacity-50';
export var btnPrimaryCls = 'px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed';
