import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/server-security';
import { igAll, igMutate, igSendLark, igUsers, igWithLark } from '@/lib/integrity-server';
import { igNewOverdue, igOverdueText } from '@/lib/integrity';

// Báo vào nhóm Lark ngay khi có lời cam kết quá hạn. Mỗi lời chỉ báo một lần.
// Được gọi định kỳ (vài phút một lần) bởi lịch trên Supabase, xem supabase-integrity-cron.sql.
// Bắt buộc header "Authorization: Bearer <khóa>", khóa là một trong hai:
//  - khóa lịch do cơ sở dữ liệu tự sinh (bảng amb_cron_token, chỉ máy chủ app đọc được) — không ai phải gõ hay dán;
//  - biến CRON_SECRET trên Vercel.
// Không trả về nội dung lời cam kết.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function reply(status: number, body: unknown) {
  return NextResponse.json(body, { status: status, headers: { 'Cache-Control': 'no-store' } });
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function allowed(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization') || '';
  const given = auth.indexOf('Bearer ') === 0 ? auth.slice(7) : '';
  if (!given) return false;
  const secret = process.env.CRON_SECRET || '';
  if (secret && same(given, secret)) return true;
  // Chưa tạo bảng hoặc không đọc được thì coi như không có khóa
  const { data, error } = await adminClient().from('amb_cron_token').select('token').eq('id', 1).maybeSingle();
  const token = !error && data ? String(data.token || '') : '';
  return token.length >= 32 && same(given, token);
}

export async function GET(req: NextRequest) {
  try {
    if (!(await allowed(req))) return reply(401, { error: 'Không có quyền' });
    const users = await igUsers();
    const now = Date.now();
    const list = igNewOverdue(await igAll(users), now);
    if (!list.length) return reply(200, { status: 'nothing' });
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    // Gửi được rồi mới đánh dấu: gửi lỗi thì lượt sau gửi lại
    await igSendLark(igOverdueText(list, await igWithLark(users), (host ? 'https://' + host : req.nextUrl.origin) + '/integrity'));
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
