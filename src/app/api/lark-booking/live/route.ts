import { NextResponse } from 'next/server';
import { buildBookingLive } from '@/lib/lark-booking-server';
import { getBookingSnapshot } from '@/lib/booking-store';
import { todayVn } from '@/lib/booking';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MIN_INTERVAL_MS = 15 * 1000;
let last: { at: number; key: string; json: string } | null = null;
let inFlight: Promise<string> | null = null;

// Đọc trực tiếp từ Lark các dòng từ đầu tháng hiện tại trở đi (vài nghìn dòng, khoảng 2-3 giây).
// Client ghép phần này lên bản lịch sử đã lưu. Gọi dồn dập trong 15 giây sẽ dùng lại kết quả vừa đọc.
export async function GET(request: Request) {
  try {
    const expected = new URL(request.url).searchParams.get('base') || undefined;
    const base = await getBookingSnapshot(expected);
    if (!base || base.version !== 2) return NextResponse.json({ error: 'no-base' }, { status: 404 });
    if (expected && base.generatedAt !== expected) return NextResponse.json({ error: 'base-mismatch' }, { status: 409 });
    const liveFrom = todayVn().slice(0, 8) + '01';
    const key = base.generatedAt + '|' + liveFrom;
    if (last && last.key === key && Date.now() - last.at < MIN_INTERVAL_MS) {
      return new Response(last.json, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    if (!inFlight) {
      inFlight = buildBookingLive(base, liveFrom)
        .then(function(live) {
          const json = JSON.stringify(live);
          last = { at: Date.now(), key: key, json: json };
          return json;
        })
        .finally(function() { inFlight = null; });
    }
    const json = await inFlight;
    return new Response(json, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
