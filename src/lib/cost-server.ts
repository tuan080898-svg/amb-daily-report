// Giá vốn và lãi lỗ: đọc/ghi ở phía máy chủ (không còn truy cập trực tiếp từ trình duyệt).
// Dùng máy khách có khóa truy cập (adminClient) nên vẫn chạy được sau khi khóa bảng trên Supabase.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CogsEntry, PnlConfig, PnlImport } from './types';

const PAGE = 1000;

export async function costGetCogs(c: SupabaseClient): Promise<CogsEntry[]> {
  const out: CogsEntry[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await c.from('cogs_entries').select('*').order('sku').range(from, from + PAGE - 1);
    if (error) throw new Error('Đọc giá vốn thất bại: ' + error.message);
    (data || []).forEach(function(r: Record<string, unknown>) { out.push({ sku: r.sku as string, name: r.name as string, cost: r.cost as number }); });
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function costGetConfig(c: SupabaseClient): Promise<PnlConfig> {
  const { data } = await c.from('pnl_config').select('*').eq('id', 1).maybeSingle();
  return {
    shopeeFeeRate: data && data.shopee_fee_rate != null ? Number(data.shopee_fee_rate) : 34,
    tiktokFeeRate: data && data.tiktok_fee_rate != null ? Number(data.tiktok_fee_rate) : 34,
    opexRate: data && data.opex_rate != null ? Number(data.opex_rate) : 16,
  };
}

function importFromRow(r: Record<string, unknown>): PnlImport {
  return {
    id: r.id as string, shopId: r.shop_id as string, shopName: r.shop_name as string, channel: r.channel as string,
    dateFrom: r.date_from as string, dateTo: r.date_to as string, dailyData: (r.daily_data || []) as PnlImport['dailyData'], importedAt: r.imported_at as string,
  };
}

function importToRow(imp: PnlImport) {
  return { id: imp.id, shop_id: imp.shopId, shop_name: imp.shopName, channel: imp.channel, date_from: imp.dateFrom, date_to: imp.dateTo, daily_data: imp.dailyData, imported_at: imp.importedAt };
}

// Bảng lãi lỗ rất nặng (hàng chục MB): trả từng đợt dưới ~3 MB để vừa giới hạn của hàm máy chủ
// Trả các dòng trong cửa sổ [offset, offset + limit). Nếu dung lượng vượt ~3 MB thì dừng sớm và báo "next" = vị trí dòng đầu tiên chưa trả
// (null = đã trả đủ cửa sổ). total = tổng số dòng, để máy khách chia cửa sổ và tải song song.
export async function costGetImportsPage(c: SupabaseClient, offset: number, limit: number = 40): Promise<{ rows: PnlImport[]; next: number | null; total: number }> {
  const cnt = await c.from('pnl_imports').select('id', { count: 'exact', head: true });
  const total = cnt.count || 0;
  const end = Math.min(offset + Math.max(1, limit), total);
  const rows: PnlImport[] = [];
  let size = 0;
  let pos = offset;
  while (pos < end) {
    const { data, error } = await c.from('pnl_imports').select('*').order('id').range(pos, Math.min(pos + 39, end - 1));
    if (error) throw new Error('Đọc lãi lỗ thất bại: ' + error.message);
    const got = data || [];
    if (got.length === 0) break;
    for (let i = 0; i < got.length; i++) {
      const imp = importFromRow(got[i]);
      const s = JSON.stringify(imp).length;
      if (rows.length > 0 && size + s > 3000000) return { rows: rows, next: pos + i, total: total };
      rows.push(imp); size += s;
    }
    pos += got.length;
  }
  return { rows: rows, next: null, total: total };
}

export async function costGetAllImports(c: SupabaseClient): Promise<PnlImport[]> {
  const out: PnlImport[] = [];
  let offset = 0;
  for (;;) {
    const page = await costGetImportsPage(c, offset, 40);
    page.rows.forEach(function(r) { out.push(r); });
    offset = page.next !== null ? page.next : offset + 40;
    if (offset >= page.total || page.rows.length === 0) break;
  }
  return out;
}

export async function costSaveCogs(c: SupabaseClient, list: CogsEntry[]): Promise<void> {
  if (list.length === 0) return;
  const rows = list.map(function(e) { return { sku: String(e.sku), name: String(e.name || ''), cost: Math.round(Number(e.cost) || 0) }; });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await c.from('cogs_entries').upsert(rows.slice(i, i + 500));
    if (error) throw new Error('Lưu giá vốn thất bại: ' + error.message);
  }
  const keep = new Set(rows.map(function(r) { return r.sku; }));
  const { data: existing } = await c.from('cogs_entries').select('sku');
  for (const r of existing || []) {
    if (!keep.has(r.sku as string)) await c.from('cogs_entries').delete().eq('sku', r.sku as string);
  }
}

export async function costSaveConfig(c: SupabaseClient, cfg: PnlConfig): Promise<void> {
  const { error } = await c.from('pnl_config').upsert({ id: 1, shopee_fee_rate: Number(cfg.shopeeFeeRate), tiktok_fee_rate: Number(cfg.tiktokFeeRate), opex_rate: Number(cfg.opexRate) });
  if (error) throw new Error('Lưu cấu hình PnL thất bại: ' + error.message);
}

// Thêm / thay các đợt nhập lãi lỗ; đợt cũ của cùng shop trùng khoảng ngày bị thay thế (giống cách app làm trước đây)
export async function costUpsertImports(c: SupabaseClient, list: PnlImport[]): Promise<void> {
  for (const imp of list) {
    const { error } = await c.from('pnl_imports').upsert(importToRow(imp));
    if (error) throw new Error('Lưu PnL import thất bại: ' + error.message);
    const { data: overlapping } = await c.from('pnl_imports').select('id').eq('shop_id', imp.shopId).lte('date_from', imp.dateTo).gte('date_to', imp.dateFrom).neq('id', imp.id);
    for (const row of overlapping || []) await c.from('pnl_imports').delete().eq('id', row.id as string);
  }
}

export async function costDeleteImports(c: SupabaseClient, ids: string[]): Promise<void> {
  for (const id of ids) {
    const { error } = await c.from('pnl_imports').delete().eq('id', id);
    if (error) throw new Error('Xóa PnL import thất bại: ' + error.message);
  }
}
