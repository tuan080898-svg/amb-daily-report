// Quy tắc thao tác với lời cam kết, dùng chung cho app (/api/integrity) và nút bấm trong Lark (/api/integrity/lark).
// Chỉ chạy trên máy chủ. Thời điểm luôn lấy theo giờ máy chủ; không có sửa hay xóa lời đã nói.
import { igItemsOf, igMutate } from './integrity-server';
import { IG_CANCEL_MINUTES, igCheckSmart, igDueIso, igLastReport, igState } from './integrity';
import type { IgCommit, IgInput, IgUser } from './integrity';

// Lỗi do người dùng (hiện nguyên văn)
export class IgBad extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export interface IgActor { id: string; role: string }

// Việc vừa xảy ra, để gửi tin Lark cho đúng người
export interface IgEvent { type: 'created' | 'reported' | 'verdict' | 'restore1' | 'restore3'; ownerId: string; id: string }

export const igStr = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
export const igIds = (a: unknown, users: IgUser[]) => (Array.isArray(a) ? Array.from(new Set(a.map(String))).filter(function(id) { return users.some(function(u) { return u.id === id; }); }) : []);
const newId = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Dựng lời cam kết mới từ dữ liệu gửi lên; không đạt SMART thì từ chối
function build(raw: unknown, ownerId: string, users: IgUser[], nowIso: string): IgCommit {
  const p = (raw || {}) as Record<string, unknown>;
  const input: IgInput = {
    title: igStr(p.title, 300), target: Number(p.target), unit: igStr(p.unit, 40), criteria: igStr(p.criteria, 600), why: igStr(p.why, 600),
    verifierId: igIds([p.verifierId], users)[0] || '', relatedIds: igIds(p.relatedIds, users).slice(0, 50), dueDate: igStr(p.dueDate, 10), dueTime: igStr(p.dueTime, 5),
  };
  const err = igCheckSmart(input, ownerId, Date.parse(nowIso));
  if (err.length) throw new IgBad(err.join('\n'));
  return {
    id: newId(), ownerId: ownerId, title: input.title, target: input.target, unit: input.unit, criteria: input.criteria, why: input.why,
    verifierId: input.verifierId, relatedIds: input.relatedIds, due: igDueIso(input.dueDate, input.dueTime), createdAt: nowIso,
    reports: [], restore: {}, acks: [],
  };
}

export async function igPerform(u: IgActor, action: string, p: Record<string, unknown>, users: IgUser[], nowIso: string): Promise<IgEvent[]> {
  const nowMs = Date.parse(nowIso);
  if (action === 'create') {
    const c = build(p, u.id, users, nowIso);
    await igMutate(u.id, function(list) {
      if (list.length >= 5000) throw new IgBad('Số lời đã lưu quá lớn');
      return list.concat([c]);
    });
    return [{ type: 'created', ownerId: u.id, id: c.id }];
  }

  const ownerId = igIds([p.ownerId], users)[0];
  const id = igStr(p.id, 40);
  if (!ownerId || !id) throw new IgBad('Không xác định được lời cam kết');
  // Sửa đúng một lời trong file của người đó
  const edit = async function(fn: (c: IgCommit, list: IgCommit[]) => void) {
    await igMutate(ownerId, function(list) {
      const c = list.find(function(x) { return x.id === id; });
      if (!c) throw new IgBad('Không tìm thấy lời cam kết');
      if (c.voided) throw new IgBad('Lời này đã hủy');
      fn(c, list);
      return list;
    });
  };
  const mustOwn = function() { if (ownerId !== u.id) throw new IgBad('Chỉ người đã nói lời này mới làm được'); };
  const closed = function(c: IgCommit) {
    const s = igState(c, nowMs);
    return s === 'kept' || s === 'restored-early' || s === 'restored-late';
  };
  const event = function(type: IgEvent['type'], eventId = id): IgEvent[] { return [{ type: type, ownerId: ownerId, id: eventId }]; };

  if (action === 'cancel') {
    mustOwn();
    await edit(function(c) {
      if (nowMs - Date.parse(c.createdAt) > IG_CANCEL_MINUTES * 60000 || c.reports.length || c.restore.step1) throw new IgBad('Chỉ rút lại được trong ' + IG_CANCEL_MINUTES + ' phút đầu. Nếu không làm được, hãy dùng 3 bước khôi phục.');
      if (c.fromId) throw new IgBad('Đây là lời nói mới của một lần khôi phục nên không rút lại được');
      c.voided = { at: nowIso, by: u.id, reason: 'Người nói rút lại ngay sau khi ghi' };
    });
    return [];
  }
  if (action === 'void') {
    if (u.role !== 'admin') throw new IgBad('Chỉ admin được hủy', 403);
    const reason = igStr(p.reason, 300);
    if (reason.length < 10) throw new IgBad('Ghi lý do hủy (ít nhất 10 ký tự)');
    await edit(function(c) { c.voided = { at: nowIso, by: u.id, reason: reason }; });
    return [];
  }
  if (action === 'report') {
    mustOwn();
    const actual = Number(p.actual), evidence = igStr(p.evidence, 1000);
    if (!(isFinite(actual) && actual >= 0)) throw new IgBad('Nhập kết quả thực tế bằng số');
    if (evidence.length < 5) throw new IgBad('Ghi bằng chứng để nghiệm thu (link, tên file, số liệu)');
    await edit(function(c) {
      if (closed(c)) throw new IgBad('Lời này đã khép lại');
      const r = igLastReport(c);
      if (r && !r.verdict) throw new IgBad('Đang chờ nghiệm thu lần báo trước');
      if (r && r.verdict && r.verdict.ok) throw new IgBad('Kết quả đã được nghiệm thu, còn lại là hoàn tất 3 bước khôi phục');
      c.reports.push({ at: nowIso, actual: actual, evidence: evidence });
    });
    return event('reported');
  }
  if (action === 'verdict') {
    const pass = p.ok === true, note = igStr(p.note, 600);
    if (!pass && note.length < 5) throw new IgBad('Không đạt thì ghi rõ còn thiếu gì');
    await edit(function(c) {
      if (c.ownerId === u.id) throw new IgBad('Không tự nghiệm thu lời của mình');
      if (c.verifierId !== u.id && u.role !== 'admin') throw new IgBad('Bạn không phải người nghiệm thu lời này');
      const r = igLastReport(c);
      if (!r || r.verdict) throw new IgBad('Không có kết quả nào đang chờ nghiệm thu');
      r.verdict = { at: nowIso, by: u.id, ok: pass, note: note };
    });
    return event('verdict');
  }
  if (action === 'restore1') {
    mustOwn();
    const message = igStr(p.message, 1000);
    const toIds = igIds(p.toIds, users).filter(function(x) { return x !== u.id; });
    if (message.length < 20) throw new IgBad('Bước 1: nói rõ chuyện gì xảy ra với lời đã nói (ít nhất 20 ký tự)');
    const current = (await igItemsOf(ownerId)).find(function(x) { return x.id === id; });
    if (!current) throw new IgBad('Không tìm thấy lời cam kết');
    const missing = current.relatedIds.concat([current.verifierId]).filter(function(x) { return toIds.indexOf(x) < 0 && users.some(function(v) { return v.id === x; }); });
    if (missing.length || !toIds.length) throw new IgBad('Bước 1: phải loan tin tới tất cả người liên quan và người nghiệm thu');
    await edit(function(c) {
      if (closed(c)) throw new IgBad('Lời này đã khép lại');
      if (c.restore.step1) throw new IgBad('Bước 1 đã làm rồi');
      c.restore.step1 = { at: nowIso, message: message, toIds: toIds, larkSent: false };
    });
    return event('restore1');
  }
  if (action === 'restore2') {
    mustOwn();
    const impact = igStr(p.impact, 1500), fix = igStr(p.fix, 1500);
    if (impact.length < 20) throw new IgBad('Bước 2: ghi tác động tới ai, tới việc gì (ít nhất 20 ký tự)');
    if (fix.length < 20) throw new IgBad('Bước 2: ghi bạn khắc phục thế nào (ít nhất 20 ký tự)');
    await edit(function(c) {
      if (closed(c)) throw new IgBad('Lời này đã khép lại');
      if (!c.restore.step1) throw new IgBad('Làm bước 1 trước');
      if (c.restore.step2) throw new IgBad('Bước 2 đã làm rồi');
      c.restore.step2 = { at: nowIso, impact: impact, fix: fix };
    });
    return [];
  }
  if (action === 'restore3') {
    mustOwn();
    const note = igStr(p.note, 600);
    const next = p.newCommit ? build(p.newCommit, u.id, users, nowIso) : null;
    if (!next && note.length < 10) throw new IgBad('Bước 3: đưa ra lời nói mới, hoặc ghi vì sao không có lời mới');
    await edit(function(c, list) {
      if (closed(c)) throw new IgBad('Lời này đã khép lại');
      if (!c.restore.step2) throw new IgBad('Làm bước 2 trước');
      c.restore.step3 = { at: nowIso, newId: next ? next.id : null, note: note };
      if (next) { next.fromId = c.id; list.push(next); }
    });
    return next ? event('restore3', next.id) : [];
  }
  if (action === 'ack') {
    await edit(function(c) {
      if (!c.restore.step1 || c.restore.step1.toIds.indexOf(u.id) < 0) throw new IgBad('Bạn không nằm trong danh sách nhận tin');
      if (!c.acks.some(function(a) { return a.userId === u.id; })) c.acks.push({ userId: u.id, at: nowIso });
    });
    return [];
  }
  throw new IgBad('Thao tác không hợp lệ');
}
