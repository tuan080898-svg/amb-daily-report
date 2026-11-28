import { NextRequest, NextResponse } from 'next/server';
import { igAll, igMutate, igSendLark, igUsers } from '@/lib/integrity-server';
import { igNewOverdue, igOverdueText } from '@/lib/integrity';

// Báo vào nhóm Lark ngay khi có lời cam kết quá hạn. Mỗi lời chỉ báo một lần.
// Được gọi định kỳ (vài phút một lần) bởi lịch trên Supabase, xem supabase-integrity-cron.sql.
// Bắt buộc header "Authorization: Bearer <CRON_SECRET>". Không trả về nội dung lời cam kết.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function reply(status: number, body: unknown) {
  return NextResponse.json(body, { status: status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.get('authorization') !== 'Bearer ' + secret) return reply(401, { error: 'Không có quyền' });
  try {
    const users = await igUsers();
    const now = Date.now();
    const list = igNewOverdue(await igAll(users), now);
    if (!list.length) return reply(200, { status: 'nothing' });
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    // Gửi được rồi mới đánh dấu: gửi lỗi thì lượt sau gửi lại
    await igSendLark(igOverdueText(list, users, (host ? 'https://' + host : req.nextUrl.origin) + '/integrity'));
    const at = new Date(now).toISOString();
    const owners = Array.from(new Set(list.map(function(c) { return c.ownerId; })));
    for (const owner of owners) {
      await igMutate(owner, function(items) {
        items.forEach(function(c) { if (list.some(function(x) { return x.id === c.id; })) c.overdueNoticeAt = at; });
        return items;
      });
    }
    return reply(200, { status: 'sent', count: list.length });
  } catch (e) {
    return reply(500, { error: e instanceof Error ? e.message : 'Lỗi hệ thống' });
  }
}
