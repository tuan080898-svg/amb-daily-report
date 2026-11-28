import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '@/lib/server-security';
import { igAll, igSendLark, igUsers } from '@/lib/integrity-server';
import { igReminderText } from '@/lib/integrity';

// Tin Lark nhắc hạn lời cam kết mỗi sáng.
//  GET  : lịch chạy của Vercel, bắt buộc header "Authorization: Bearer <CRON_SECRET>".
//  POST : admin xem trước hoặc bấm "Gửi nhắc ngay" trên trang.
// Biến môi trường (đặt trên Vercel): LARK_INTEGRITY_WEBHOOK, CRON_SECRET, tùy chọn LARK_INTEGRITY_SIGN (khóa ký của bot).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function reply(status: number, body: unknown) {
  return NextResponse.json(body, { status: status, headers: { 'Cache-Control': 'no-store' } });
}

async function reminder(req: NextRequest): Promise<string> {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const link = (host ? 'https://' + host : req.nextUrl.origin) + '/integrity';
  const users = await igUsers();
  return igReminderText(await igAll(users), users, Date.now(), link);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.get('authorization') !== 'Bearer ' + secret) return reply(401, { error: 'Không có quyền' });
  try {
    const text = await reminder(req);
    if (!text) return reply(200, { status: 'nothing' });
    await igSendLark(text);
    return reply(200, { status: 'sent' });
  } catch (e) {
    return reply(500, { error: e instanceof Error ? e.message : 'Lỗi hệ thống' });
  }
}

export async function POST(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return reply(401, { error: 'Chưa đăng nhập hoặc phiên đã hết hạn' });
    if (u.role !== 'admin') return reply(403, { error: 'Chỉ admin được gửi tin' });
    const body = await req.json().catch(function() { return {}; });
    const text = await reminder(req);
    const send = body.send === true && !!text;
    if (send) await igSendLark(text);
    return reply(200, { text: text, sent: send });
  } catch (e) {
    return reply(500, { error: e instanceof Error ? e.message : 'Lỗi hệ thống' });
  }
}
