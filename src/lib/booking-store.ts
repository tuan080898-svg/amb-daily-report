import { supabase } from './supabase';

// Bản tổng hợp booking được lưu trong Supabase Storage (cùng bucket với dữ liệu SKU) để trang mở tức thì,
// không phải gọi Lark mỗi lần xem.
const BUCKET = 'sku-data';
const FILE = 'booking-snapshot.json';

export async function readBookingSnapshotText(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(BUCKET).download(FILE);
  if (error || !data) return null;
  return await data.text();
}

export async function writeBookingSnapshotText(text: string): Promise<void> {
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const blob = new Blob([text], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(FILE, blob, { upsert: true, contentType: 'application/json', cacheControl: '0' });
  if (error) throw new Error('Lưu bản tổng hợp booking thất bại: ' + error.message);
}
