import { NextResponse } from 'next/server';

// Mã bản đang chạy trên máy chủ (mã commit của lần deploy). Trang đang mở so sánh với mã này để biết có bản mới chưa.
export const dynamic = 'force-dynamic';

export async function GET() {
  var v = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev';
  return NextResponse.json({ v: v }, { headers: { 'Cache-Control': 'no-store' } });
}
