import { NextResponse } from 'next/server';
import { readBookingSnapshotText } from '@/lib/booking-store';

export const dynamic = 'force-dynamic';

// Trả bản tổng hợp booking đã lưu (nhanh). Làm mới từ Lark ở /api/lark-booking/sync.
export async function GET() {
  try {
    const text = await readBookingSnapshotText();
    if (!text) return NextResponse.json({ error: 'no-snapshot' }, { status: 404 });
    return new Response(text, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
