// Đọc dữ liệu và dựng báo cáo cảnh báo nhập hàng ở phía máy chủ (dùng trong /api/canhbao).
// Cài đặt và hàng đang về lưu ở sku-data/canhbao/data.json.
import { readJson, writeJson } from './storage-server';
import { adminClient } from './server-security';
import { cbBuildReport, cbEmptyData } from './canhbao';
import type { CbData, CbInput, CbReport, CbSalesImport } from './canhbao';

const PATH = 'canhbao/data.json';

export async function cbGetData(): Promise<CbData> {
  const j = await readJson<Partial<CbData>>(PATH);
  const e = cbEmptyData();
  if (!j) return e;
  return { settings: Object.assign(e.settings, j.settings || {}), products: j.products || {}, incoming: j.incoming || [] };
}

// Đọc bản mới nhất -> áp thay đổi -> ghi lại, để không đè thay đổi của người khác vừa lưu
export async function cbMutate(fn: (d: CbData) => CbData): Promise<CbData> {
  const next = fn(await cbGetData());
  await writeJson(PATH, next);
  return next;
}

// Đọc hết bảng theo từng trang 1.000 dòng; thiếu một trang là số tồn sai nên lỗi thì dừng
async function readAll<T>(table: string, columns: string, orderBy: string[]): Promise<T[]> {
  const db = adminClient();
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns);
    orderBy.forEach(function(c) { q = q.order(c); });
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error('Đọc bảng ' + table + ' thất bại: ' + error.message);
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

export function vnToday(): string {
  return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
}

export async function cbReport(): Promise<CbReport> {
  const [imports, mappings, shops, configs, transactions, data] = await Promise.all([
    readJson<CbSalesImport[]>('imports.json'),
    readJson<CbInput['mappings']>('mappings.json'),
    readAll<CbInput['shops'][number]>('shops', 'id, name, region', ['id']),
    readAll<CbInput['configs'][number]>('inventory_configs', 'product, warehouse, initial_stock', ['product', 'warehouse']),
    readAll<CbInput['transactions'][number]>('inventory_transactions', 'product, warehouse, quantity, date, note', ['id']),
    cbGetData(),
  ]);
  if (!imports || !mappings) throw new Error('Chưa có dữ liệu bán hàng hoặc bảng quy đổi SKU');
  return cbBuildReport({ today: vnToday(), imports: imports, mappings: mappings, shops: shops, configs: configs, transactions: transactions, data: data });
}
