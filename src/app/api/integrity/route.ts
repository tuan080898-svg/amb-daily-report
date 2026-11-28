import { after, NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '@/lib/server-security';
import { igAll, igLarkIds, igLarkReady, igSaveLarkIds, igSendLark, igUsers, igWithLark } from '@/lib/integrity-server';
import { igAppConfigured, igAppReady, igLookupOpenId, igSendCard } from '@/lib/integrity-lark-app';
import { IgBad, igIds, igPerform, igStr } from '@/lib/integrity-actions';
import { igPingCard } from '@/lib/integrity-card';
import { igLink, igNotifyDirect, igNotifyGroup } from '@/lib/integrity-notify';
import { igContact, igSummary, igTag, igValidLarkId } from '@/lib/integrity';
import type { IgUser } from '@/lib/integrity';

// Integrity: mọi tài khoản đều xem được lời của cả tổ chức (minh bạch). Mỗi thao tác chỉ đúng người mới làm được
// (quy tắc ở lib/integrity-actions.ts, dùng chung với nút bấm trong Lark).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status: status, headers: { 'Cache-Control': 'no-store' } });
}
function ok(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

async function data(isAdmin: boolean) {
  const users = await igUsers();
  return { now: new Date().toISOString(), users: users, items: await igAll(users), larkReady: igLarkReady(), larkApp: igAppReady(), larkIds: isAdmin ? await igLarkIds() : undefined };
}

export async function GET(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return fail(401, 'Chưa đăng nhập hoặc phiên đã hết hạn');
    const d = await data(u.role === 'admin');
    if (req.nextUrl.searchParams.get('summary') === '1') return ok(igSummary(d.items, u.id, Date.now()));
    return ok(d);
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}

// Admin nhập email, số điện thoại hoặc mã Lark; email và số điện thoại được đổi thành Open ID của ứng dụng
async function saveLarkIds(raw: Record<string, unknown>, users: IgUser[]) {
  const next: Record<string, string> = {};
  for (const user of users) {
    const v = igStr(raw[user.id], 120);
    if (!v) continue;
    const contact = igContact(v);
    let id = v;
    if (contact) {
      if (!igAppConfigured()) throw new IgBad('Chưa cài ứng dụng Lark nên chưa tra được theo email/số điện thoại, hãy dán mã Lark');
      try {
        id = await igLookupOpenId(contact);
      } catch (e) {
        throw new IgBad('Không tra được mã của ' + user.name + ': ' + (e instanceof Error ? e.message : 'lỗi'));
      }
      if (!id) throw new IgBad('Lark không tìm thấy ' + v + ' của ' + user.name + ' (sai email/số, hoặc người đó ngoài phạm vi ứng dụng)');
    }
    if (!igValidLarkId(id)) throw new IgBad('Mã Lark của ' + user.name + ' không hợp lệ (chỉ gồm chữ, số, gạch dưới, gạch ngang)');
    if (Object.keys(next).some(function(k) { return next[k] === id; })) throw new IgBad('Mã Lark của ' + user.name + ' trùng với người khác');
    next[user.id] = id;
  }
  await igSaveLarkIds(next);
}

export async function POST(req: NextRequest) {
  try {
    const u = await sessionUser(req);
    if (!u) return fail(401, 'Chưa đăng nhập hoặc phiên đã hết hạn');
    const body = await req.json().catch(function() { return null; });
    const action = String((body && body.action) || '');
    const p = body && body.payload;
    if (!p || typeof p !== 'object') return fail(400, 'Dữ liệu không hợp lệ');
    const users = await igUsers();
    let warning = '';

    if (action === 'setLarkIds') {
      if (u.role !== 'admin') return fail(403, 'Chỉ admin được khai mã Lark');
      await saveLarkIds((p.ids && typeof p.ids === 'object' ? p.ids : {}) as Record<string, unknown>, users);
    } else if (action === 'testTag' || action === 'testCard') {
      if (u.role !== 'admin') return fail(403, 'Chỉ admin được gửi tin thử');
      const target = igIds([p.userId], users)[0];
      const tagged = await igWithLark(users);
      const who = tagged.find(function(x) { return x.id === target; });
      if (!who || !who.larkId) return fail(400, 'Lưu mã Lark của người này trước khi thử');
      try {
        if (action === 'testTag') await igSendLark('🔔 Integrity – tin thử gắn tên: ' + igTag(tagged, who.id));
        else {
          if (!igAppReady()) throw new Error('Chưa đặt đủ LARK_APP_ID, LARK_APP_SECRET, LARK_VERIFY_TOKEN trên Vercel');
          await igSendCard(who.larkId, igPingCard(who.name));
        }
      } catch (e) {
        throw new IgBad(e instanceof Error ? e.message : 'Không gửi được tin Lark');
      }
    } else {
      const events = await igPerform(u, action, p, users, new Date().toISOString());
      const link = igLink(req.nextUrl.origin);
      warning = await igNotifyGroup(events, users, link);
      // Thẻ riêng gửi sau khi đã trả lời để người dùng không phải chờ
      if (events.length) after(function() { return igNotifyDirect(events, users, link); });
    }
    return ok(Object.assign(await data(u.role === 'admin'), { warning: warning }));
  } catch (e) {
    if (e instanceof IgBad) return fail(e.status, e.message);
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}
