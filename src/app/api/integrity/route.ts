import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '@/lib/server-security';
import { igAll, igItemsOf, igLarkIds, igLarkReady, igMutate, igSaveLarkIds, igSendLark, igUsers, igWithLark } from '@/lib/integrity-server';
import { IG_CANCEL_MINUTES, igCheckSmart, igDueIso, igLastReport, igNewsText, igState, igSummary, igTag, igValidLarkId } from '@/lib/integrity';
import type { IgCommit, IgInput, IgUser } from '@/lib/integrity';

// Integrity: mọi tài khoản đều xem được lời của cả tổ chức (minh bạch). Mỗi thao tác chỉ đúng người mới làm được,
// thời điểm luôn lấy theo giờ máy chủ. Không có sửa hay xóa lời đã nói.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status: status, headers: { 'Cache-Control': 'no-store' } });
}
function ok(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

// Lỗi do người dùng (trả 400, hiện nguyên văn)
class Bad extends Error {}

const str = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
const ids = (a: unknown, users: IgUser[]) => (Array.isArray(a) ? Array.from(new Set(a.map(String))).filter(function(id) { return users.some(function(u) { return u.id === id; }); }) : []);
const newId = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function data(isAdmin: boolean) {
  const users = await igUsers();
  return { now: new Date().toISOString(), users: users, items: await igAll(users), larkReady: igLarkReady(), larkIds: isAdmin ? await igLarkIds() : undefined };
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

// Dựng lời cam kết mới từ dữ liệu gửi lên; không đạt SMART thì từ chối
function build(raw: unknown, ownerId: string, users: IgUser[], nowIso: string): IgCommit {
  const p = (raw || {}) as Record<string, unknown>;
  const input: IgInput = {
    title: str(p.title, 300), target: Number(p.target), unit: str(p.unit, 40), criteria: str(p.criteria, 600), why: str(p.why, 600),
    verifierId: ids([p.verifierId], users)[0] || '', relatedIds: ids(p.relatedIds, users).slice(0, 50), dueDate: str(p.dueDate, 10), dueTime: str(p.dueTime, 5),
  };
  const err = igCheckSmart(input, ownerId, Date.parse(nowIso));
  if (err.length) throw new Bad(err.join('\n'));
  return {
    id: newId(), ownerId: ownerId, title: input.title, target: input.target, unit: input.unit, criteria: input.criteria, why: input.why,
    verifierId: input.verifierId, relatedIds: input.relatedIds, due: igDueIso(input.dueDate, input.dueTime), createdAt: nowIso,
    reports: [], restore: {}, acks: [],
  };
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
    const nowIso = new Date().toISOString();
    const nowMs = Date.parse(nowIso);
    let warning = '';

    if (action === 'setLarkIds') {
      if (u.role !== 'admin') return fail(403, 'Chỉ admin được khai mã Lark');
      const raw = (p.ids && typeof p.ids === 'object' ? p.ids : {}) as Record<string, unknown>;
      const next: Record<string, string> = {};
      for (const user of users) {
        const v = str(raw[user.id], 80);
        if (!v) continue;
        if (!igValidLarkId(v)) return fail(400, 'Mã Lark của ' + user.name + ' không hợp lệ (chỉ gồm chữ, số, gạch dưới, gạch ngang)');
        next[user.id] = v;
      }
      await igSaveLarkIds(next);
    } else if (action === 'testTag') {
      if (u.role !== 'admin') return fail(403, 'Chỉ admin được gửi tin thử');
      const target = ids([p.userId], users)[0];
      const tagged = await igWithLark(users);
      if (!target || !tagged.some(function(x) { return x.id === target && !!x.larkId; })) return fail(400, 'Lưu mã Lark của người này trước khi thử');
      try {
        await igSendLark('🔔 Integrity – tin thử gắn tên: ' + igTag(tagged, target));
      } catch (e) {
        throw new Bad(e instanceof Error ? e.message : 'Không gửi được tin Lark');
      }
    } else if (action === 'create') {
      const c = build(p, u.id, users, nowIso);
      await igMutate(u.id, function(list) {
        if (list.length >= 5000) throw new Bad('Số lời đã lưu quá lớn');
        return list.concat([c]);
      });
    } else {
      const ownerId = ids([p.ownerId], users)[0];
      const id = str(p.id, 40);
      if (!ownerId || !id) return fail(400, 'Không xác định được lời cam kết');
      // Sửa đúng một lời trong file của người đó
      const edit = async function(fn: (c: IgCommit, list: IgCommit[]) => void) {
        await igMutate(ownerId, function(list) {
          const c = list.find(function(x) { return x.id === id; });
          if (!c) throw new Bad('Không tìm thấy lời cam kết');
          if (c.voided) throw new Bad('Lời này đã hủy');
          fn(c, list);
          return list;
        });
      };
      const mustOwn = function() { if (ownerId !== u.id) throw new Bad('Chỉ người đã nói lời này mới làm được'); };
      const closed = function(c: IgCommit) {
        const s = igState(c, nowMs);
        return s === 'kept' || s === 'restored-early' || s === 'restored-late';
      };

      if (action === 'cancel') {
        mustOwn();
        await edit(function(c) {
          if (nowMs - Date.parse(c.createdAt) > IG_CANCEL_MINUTES * 60000 || c.reports.length || c.restore.step1) throw new Bad('Chỉ rút lại được trong ' + IG_CANCEL_MINUTES + ' phút đầu. Nếu không làm được, hãy dùng 3 bước khôi phục.');
          if (c.fromId) throw new Bad('Đây là lời nói mới của một lần khôi phục nên không rút lại được');
          c.voided = { at: nowIso, by: u.id, reason: 'Người nói rút lại ngay sau khi ghi' };
        });
      } else if (action === 'void') {
        if (u.role !== 'admin') return fail(403, 'Chỉ admin được hủy');
        const reason = str(p.reason, 300);
        if (reason.length < 10) return fail(400, 'Ghi lý do hủy (ít nhất 10 ký tự)');
        await edit(function(c) { c.voided = { at: nowIso, by: u.id, reason: reason }; });
      } else if (action === 'report') {
        mustOwn();
        const actual = Number(p.actual), evidence = str(p.evidence, 1000);
        if (!(isFinite(actual) && actual >= 0)) return fail(400, 'Nhập kết quả thực tế bằng số');
        if (evidence.length < 5) return fail(400, 'Ghi bằng chứng để nghiệm thu (link, tên file, số liệu)');
        await edit(function(c) {
          if (closed(c)) throw new Bad('Lời này đã khép lại');
          const r = igLastReport(c);
          if (r && !r.verdict) throw new Bad('Đang chờ nghiệm thu lần báo trước');
          if (r && r.verdict && r.verdict.ok) throw new Bad('Kết quả đã được nghiệm thu, còn lại là hoàn tất 3 bước khôi phục');
          c.reports.push({ at: nowIso, actual: actual, evidence: evidence });
        });
      } else if (action === 'verdict') {
        const pass = p.ok === true, note = str(p.note, 600);
        if (!pass && note.length < 5) return fail(400, 'Không đạt thì ghi rõ còn thiếu gì');
        await edit(function(c) {
          if (c.ownerId === u.id) throw new Bad('Không tự nghiệm thu lời của mình');
          if (c.verifierId !== u.id && u.role !== 'admin') throw new Bad('Bạn không phải người nghiệm thu lời này');
          const r = igLastReport(c);
          if (!r || r.verdict) throw new Bad('Không có kết quả nào đang chờ nghiệm thu');
          r.verdict = { at: nowIso, by: u.id, ok: pass, note: note };
        });
      } else if (action === 'restore1') {
        mustOwn();
        const message = str(p.message, 1000);
        const toIds = ids(p.toIds, users).filter(function(x) { return x !== u.id; });
        if (message.length < 20) return fail(400, 'Bước 1: nói rõ chuyện gì xảy ra với lời đã nói (ít nhất 20 ký tự)');
        const current = (await igItemsOf(ownerId)).find(function(x) { return x.id === id; });
        if (!current) return fail(400, 'Không tìm thấy lời cam kết');
        const missing = current.relatedIds.concat([current.verifierId]).filter(function(x) { return toIds.indexOf(x) < 0 && users.some(function(v) { return v.id === x; }); });
        if (missing.length || !toIds.length) return fail(400, 'Bước 1: phải loan tin tới tất cả người liên quan và người nghiệm thu');
        await edit(function(c) {
          if (closed(c)) throw new Bad('Lời này đã khép lại');
          if (c.restore.step1) throw new Bad('Bước 1 đã làm rồi');
          c.restore.step1 = { at: nowIso, message: message, toIds: toIds, larkSent: false };
        });
        // Tin Lark gửi sau khi đã ghi nhận; gửi lỗi vẫn giữ bước 1 và báo cho người dùng tự nhắn
        try {
          const c = (await igItemsOf(ownerId)).find(function(x) { return x.id === id; })!;
          const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
          await igSendLark(igNewsText(c, await igWithLark(users), (host ? 'https://' + host : req.nextUrl.origin) + '/integrity'));
          await edit(function(x) { if (x.restore.step1) x.restore.step1.larkSent = true; });
        } catch (e) {
          warning = 'Đã ghi bước 1 nhưng chưa gửi được tin Lark (' + (e instanceof Error ? e.message : 'lỗi') + '). Hãy nhắn trực tiếp cho người liên quan.';
        }
      } else if (action === 'restore2') {
        mustOwn();
        const impact = str(p.impact, 1500), fix = str(p.fix, 1500);
        if (impact.length < 20) return fail(400, 'Bước 2: ghi tác động tới ai, tới việc gì (ít nhất 20 ký tự)');
        if (fix.length < 20) return fail(400, 'Bước 2: ghi bạn khắc phục thế nào (ít nhất 20 ký tự)');
        await edit(function(c) {
          if (closed(c)) throw new Bad('Lời này đã khép lại');
          if (!c.restore.step1) throw new Bad('Làm bước 1 trước');
          if (c.restore.step2) throw new Bad('Bước 2 đã làm rồi');
          c.restore.step2 = { at: nowIso, impact: impact, fix: fix };
        });
      } else if (action === 'restore3') {
        mustOwn();
        const note = str(p.note, 600);
        const next = p.newCommit ? build(p.newCommit, u.id, users, nowIso) : null;
        if (!next && note.length < 10) return fail(400, 'Bước 3: đưa ra lời nói mới, hoặc ghi vì sao không có lời mới');
        await edit(function(c, list) {
          if (closed(c)) throw new Bad('Lời này đã khép lại');
          if (!c.restore.step2) throw new Bad('Làm bước 2 trước');
          c.restore.step3 = { at: nowIso, newId: next ? next.id : null, note: note };
          if (next) { next.fromId = c.id; list.push(next); }
        });
      } else if (action === 'ack') {
        await edit(function(c) {
          if (!c.restore.step1 || c.restore.step1.toIds.indexOf(u.id) < 0) throw new Bad('Bạn không nằm trong danh sách nhận tin');
          if (!c.acks.some(function(a) { return a.userId === u.id; })) c.acks.push({ userId: u.id, at: nowIso });
        });
      } else {
        return fail(400, 'Thao tác không hợp lệ');
      }
    }
    return ok(Object.assign(await data(u.role === 'admin'), { warning: warning }));
  } catch (e) {
    if (e instanceof Bad) return fail(400, e.message);
    return fail(500, e instanceof Error ? e.message : 'Lỗi hệ thống');
  }
}
