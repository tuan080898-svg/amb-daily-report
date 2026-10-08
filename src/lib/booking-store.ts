import { supabase } from './supabase';
import type { BookingSnapshot } from './booking';

// Bản tổng hợp toàn bộ lịch sử booking được lưu trong Supabase Storage (cùng bucket với dữ liệu SKU).
// Phần mới (từ đầu tháng) được đọc trực tiếp từ Lark mỗi lần cần, ghép lên bản này.
const BUCKET = 'sku-data';
const FILE = 'booking-snapshot.json';
const CACHE_MS = 5 * 60 * 1000;

let cache: { at: number; snap: BookingSnapshot } | null = null;

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

export function setCachedBookingSnapshot(snap: BookingSnapshot): void {
  cache = { at: Date.now(), snap: snap };
}

// Bản lịch sử đã phân tích, giữ trong bộ nhớ vài phút để không phải tải lại file lớn ở mỗi lần đọc trực tiếp
export async function getBookingSnapshot(expectedGeneratedAt?: string): Promise<BookingSnapshot | null> {
  if (cache && Date.now() - cache.at < CACHE_MS && (!expectedGeneratedAt || cache.snap.generatedAt === expectedGeneratedAt)) return cache.snap;
  const text = await readBookingSnapshotText();
  if (!text) return null;
  const snap = JSON.parse(text) as BookingSnapshot;
  cache = { at: Date.now(), snap: snap };
  return snap;
}
