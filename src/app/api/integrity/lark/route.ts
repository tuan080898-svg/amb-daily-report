import { after, NextRequest, NextResponse } from 'next/server';
import { igItemsOf, igLarkIds, igUsers } from '@/lib/integrity-server';
import { igReadCallback } from '@/lib/integrity-lark-app';
import { IgBad, igPerform, igStr, type IgEvent } from '@/lib/integrity-actions';
import { igCard, igParseDue, type IgButton, type IgMode } from '@/lib/integrity-card';
import { igLink, igNotifyDirect, igNotifyGroup } from '@/lib/integrity-notify';
import type { IgUser } from '@/lib/integrity';

// Nhận nút bấm trên thẻ Integrity trong Lark (callback "card.action.trigger") và bước xác minh địa chỉ.
// Chỉ nhận yêu cầu mang đúng LARK_VERIFY_TOKEN. Người thao tác là người Lark báo đã bấm, đối chiếu với mã Lark
// admin đã khai; quy tắc ai được làm gì giống hệt trên app. Lark yêu cầu trả lời trong 3 giây nên tin nhắn đi
// kèm được gửi sau khi đã trả lời.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Toast = 'success' | 'error' | 'info';

function reply(type: Toast, content: string, card?: unknown) {
  const body: Record<string, unknown> = { toast: { type: type, content: content } };
  if (card) body.card = { type: 'raw', data: card };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

interface Callback {
  type?: string;
  challenge?: string;
  header?: { event_type?: string; app_id?: string };
  event?: { operator?: { open_id?: string; user_id?: string }; action?: { value?: unknown; form_value?: Record<string, unknown> } };
}

export async function POST(req: NextRequest) {
  const body = igReadCallback(await req.text()) as Callback | null;
  if (!body) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 });
  if (body.type === 'url_verification') return NextResponse.json({ challenge: body.challenge });
  if (!body.header || body.header.event_type !== 'card.action.trigger') return NextResponse.json({});
  if (process.env.LARK_APP_ID && body.header.app_id !== process.env.LARK_APP_ID) return NextResponse.json({ error: 'Không có quyền' }, { status: 401 });

  try {
    const op = (body.event && body.event.operator) || {};
    const action = body.event && body.event.action;
    const value = ((action && action.value) || {}) as Partial<IgButton>;
    const f = (action && action.form_value) || {};
    const [users, larkIds] = await Promise.all([igUsers(), igLarkIds()]);
    const mine = users.filter(function(u) { const id = larkIds[u.id]; return !!id && (id === op.open_id || id === op.user_id); });
    if (mine.length !== 1) return reply('error', 'Tài khoản Lark này chưa liên kết với app. Gửi admin mã: ' + (op.open_id || '?'));
    const me: IgUser = mine[0];
    if (value.a === 'ping') return reply('success', 'Kết nối tốt, app nhận ra bạn là ' + me.name);

    const ownerId = String(value.o || ''), id = String(value.i || '');
    const view = value.v === 'verify' || value.v === 'news' ? value.v : 'owner';
    const link = igLink(req.nextUrl.origin);
    const load = async function() { return (await igItemsOf(ownerId)).find(function(c) { return c.id === id; }); };
    const before = users.some(function(u) { return u.id === ownerId; }) ? await load() : undefined;
    if (!before) return reply('error', 'Không tìm thấy lời cam kết');
    // Thẻ của người cam kết chỉ chính họ được mở các ô nhập
    if (view === 'owner' && me.id !== ownerId) return reply('error', 'Chỉ người đã nói lời này mới làm được');
    const show = async function(mode?: IgMode) { return igCard((await load()) || before, view, users, Date.now(), link, mode); };

    if (value.a === 'mode') return reply('info', value.m === 'restore' ? 'Khôi phục Integrity' : 'Báo hoàn thành', await show(value.m === 'restore' ? 'restore' : 'report'));

    const key = { ownerId: ownerId, id: id };
    const now = new Date();
    let events: IgEvent[] = [];
    let done = 'Đã ghi';
    const perform = async function(name: string, payload: Record<string, unknown>, message: string) {
      events = await igPerform(me, name, Object.assign({}, key, payload), users, now.toISOString());
      done = message;
    };
    const rehire = function(date: string, time: string) {
      return perform('restore3', { note: '', newCommit: Object.assign({}, before, { dueDate: date, dueTime: time }) }, 'Đã hứa lại. Khôi phục xong 3 bước');
    };

    try {
      if (value.a === 'report') {
        const raw = igStr(f.actual, 30).replace(',', '.');
        await perform('report', { actual: raw === '' ? NaN : Number(raw), evidence: f.evidence }, 'Đã gửi người nghiệm thu');
      } else if (value.a === 'ok' || value.a === 'no') {
        await perform('verdict', { ok: value.a === 'ok', note: f.note }, value.a === 'ok' ? 'Đã nghiệm thu: đạt' : 'Đã ghi: chưa đạt');
      } else if (value.a === 'r1') {
        await perform('restore1', { message: f.message, toIds: before.relatedIds.concat([before.verifierId]) }, 'Đã báo mọi người (1/3)');
      } else if (value.a === 'r2') {
        await perform('restore2', { impact: f.impact, fix: f.fix }, 'Đã lưu (2/3)');
      } else if (value.a === 'r3new') {
        const parts = String(value.d || '').split(' ');
        await rehire(parts[0] || '', parts[1] || '');
      } else if (value.a === 'r3custom') {
        const due = igParseDue(igStr(f.due, 30), now.getTime());
        if (!due) throw new IgBad('Chưa hiểu hạn. Gõ dạng giờ ngày/tháng, ví dụ 17:00 05/12');
        await rehire(due.date, due.time);
      } else if (value.a === 'r3none') {
        await perform('restore3', { note: f.note }, 'Khôi phục xong 3 bước');
      } else if (value.a === 'ack') {
        await perform('ack', {}, 'Đã xác nhận nhận tin');
      } else {
        return reply('error', 'Nút này không còn dùng được');
      }
    } catch (e) {
      if (!(e instanceof IgBad)) throw e;
      // Bị từ chối vì dữ liệu: giữ nguyên thẻ để không mất chữ đã gõ. Vì việc đã đổi: hiện trạng thái mới.
      const fresh = await load();
      const changed = JSON.stringify(fresh) !== JSON.stringify(before) || /đã khép|đã làm rồi|Đang chờ nghiệm thu|Không có kết quả nào|đã hủy|đã được nghiệm thu/.test(e.message);
      return reply('error', e.message, changed ? await show() : undefined);
    }

    const sent = events;
    if (sent.length) after(async function() {
      await igNotifyGroup(sent, users, link);
      await igNotifyDirect(sent, users, link);
    });
    return reply('success', done, await show());
  } catch (e) {
    console.error('Integrity Lark: ' + (e instanceof Error ? e.message : e));
    return reply('error', 'App đang lỗi, thử lại sau hoặc mở trong app');
  }
}
