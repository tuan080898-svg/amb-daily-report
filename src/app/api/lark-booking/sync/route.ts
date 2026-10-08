import { NextResponse } from 'next/server';
import { buildBookingSnapshot } from '@/lib/lark-booking-server';
import { readBookingSnapshotText, writeBookingSnapshotText, setCachedBookingSnapshot } from '@/lib/booking-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MIN_INTERVAL_MS = 2 * 60 * 1000;
let inFlight: Promise<{ generatedAt: string; contactRows: number; scheduleRows: number }> | null = null;

async function sync() {
  const snap = await buildBookingSnapshot();
  await writeBookingSnapshotText(JSON.stringify(snap));
  setCachedBookingSnapshot(snap);
  return { generatedAt: snap.generatedAt, contactRows: snap.meta.contactRows, scheduleRows: snap.meta.scheduleRows };
}

// Đọc toàn bộ các bảng booking từ Lark, tổng hợp và lưu lại. Gọi từ nút "Làm mới" và từ lịch chạy hằng ngày.
// Nếu bản hiện có mới hơn 2 phút thì không gọi Lark lại (tránh bị gọi dồn dập).
export async function GET() {
  try {
    const t0 = Date.now();
    const existing = await readBookingSnapshotText();
    if (existing) {
      const m = existing.match(/"generatedAt":"([^"]+)"/);
      const at = m ? Date.parse(m[1]) : 0;
      if (at && Date.now() - at < MIN_INTERVAL_MS) return NextResponse.json({ status: 'fresh', generatedAt: m![1] });
    }
    if (!inFlight) inFlight = sync().finally(function() { inFlight = null; });
    const r = await inFlight;
    return NextResponse.json({ status: 'updated', ...r, seconds: Math.round((Date.now() - t0) / 100) / 10 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
