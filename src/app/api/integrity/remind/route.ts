import { after, NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '@/lib/server-security';
import { igAll, igSendLark, igUsers, igWithLark } from '@/lib/integrity-server';
import { igDigestDirect, igLink } from '@/lib/integrity-notify';
import { igReadable, igReminderText } from '@/lib/integrity';

// Tin Lark nhắc hạn lời cam kết mỗi sáng.
//  GET  : lịch chạy của Vercel, bắt buộc header "Authorization: Bearer <CRON_SECRET>".
//  POST : admin xem trước hoặc bấm "Gửi nhắc ngay" trên trang.
// Biến môi trường (đặt trên Vercel): LARK_INTEGRITY_WEBHOOK, CRON_SECRET, tùy chọn LARK_INTEGRITY_SIGN (khóa ký của bot).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function reply(status: number, body: unknown) {
  return NextResponse.json(body, { status: status, headers: { 'Cache-Control': 'no-store' } });
}

async function reminder(req: NextRequest): Promise<{ text: string; direct: () => Promise<void> }> {
  const link = igLink(req.nextUrl.origin);
  const users = await igUsers();
  const items = await igAll(users);
  // direct: thẻ riêng cho từng người, gửi sau khi đã trả lời
  return { text: igReminderText(items, await igWithLark(users), Date.now(), link), direct: function() { return igDigestDirect(items, users, link); } };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.get('authorization') !== 'Bearer ' + secret) return reply(401, { error: 'Không có quyền' });
  try {
    const r = await reminder(req);
    if (!r.text) return reply(200, { status: 'nothing' });
    await igSendLark(r.text);
    after(r.direct);
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
    const r = await reminder(req);
    const send = body.send === true && !!r.text;
    if (send) { await igSendLark(r.text); after(r.direct); }
    return reply(200, { text: igReadable(r.text), sent: send });
  } catch (e) {
    return reply(500, { error: e instanceof Error ? e.message : 'Lỗi hệ thống' });
  }
}
