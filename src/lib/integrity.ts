// Module Integrity (trân trọng lời nói của mình): kiểu dữ liệu, kiểm tra SMART, trạng thái lời cam kết và cách đo.
// Dùng chung cho trình duyệt và máy chủ, không đọc/ghi gì.
//
// Định nghĩa áp dụng: làm đúng, đủ điều đã nói; HOẶC ngay khi thấy nguy cơ không làm được thì làm đủ 3 bước khôi phục.
//  1. Loan tin tới những người liên quan
//  2. Tìm hiểu tác động của việc không giữ được lời và khắc phục
//  3. Đưa ra lời nói mới (nếu có)

export interface IgUser { id: string; name: string; role: string }

export interface IgReport {
  at: string; // lúc báo đã hoàn thành: mốc để xét đúng hạn
  actual: number;
  evidence: string;
  verdict?: { at: string; by: string; ok: boolean; note: string };
}

export interface IgRestore {
  step1?: { at: string; message: string; toIds: string[]; larkSent: boolean };
  step2?: { at: string; impact: string; fix: string };
  step3?: { at: string; newId: string | null; note: string };
}

export interface IgCommit {
  id: string;
  ownerId: string;
  title: string;
  target: number;
  unit: string;
  criteria: string; // tiêu chí nghiệm thu
  why: string;
  verifierId: string;
  relatedIds: string[];
  due: string; // ISO
  createdAt: string;
  fromId?: string; // lời nói mới thay cho lời nào
  reports: IgReport[];
  restore: IgRestore;
  acks: Array<{ userId: string; at: string }>; // người liên quan đã nhận tin
  voided?: { at: string; by: string; reason: string };
  overdueNoticeAt?: string; // đã tự báo quá hạn vào nhóm Lark (mỗi lời chỉ báo một lần)
}

export interface IgInput {
  title: string;
  target: number;
  unit: string;
  criteria: string;
  why: string;
  verifierId: string;
  relatedIds: string[];
  dueDate: string; // YYYY-MM-DD (giờ Việt Nam)
  dueTime: string; // HH:mm
}

export interface IgData { now: string; users: IgUser[]; items: IgCommit[]; larkReady: boolean }
export interface IgSummary { overdue: number; dueToday: number; toVerify: number; news: number }

export const IG_CANCEL_MINUTES = 15;
export const IG_VAGUE = ['cố gắng', 'cố hết sức', 'sẽ xem', 'xem xét', 'sớm nhất', 'sớm thôi', 'khi nào rảnh', 'có thể sẽ', 'hy vọng', 'chắc là', 'dự kiến', 'nỗ lực'];

export function igDueIso(date: string, time: string): string {
  const t = Date.parse(date + 'T' + time + ':00+07:00');
  return isFinite(t) ? new Date(t).toISOString() : '';
}

// Ngày theo giờ Việt Nam
export function igDay(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 10);
}

export function igFmt(iso: string): string {
  const s = new Date(Date.parse(iso) + 7 * 3600000).toISOString();
  return s.slice(11, 16) + ' ' + s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
}

// Kiểm tra SMART. Mỗi lỗi gắn với bước trên form: 1 = việc gì, đo thế nào; 2 = khi nào; 3 = liên quan tới ai.
export type IgStep = 1 | 2 | 3;

export function igSmartErrors(i: IgInput, ownerId: string, nowMs: number): Array<{ step: IgStep; msg: string }> {
  const err: Array<{ step: IgStep; msg: string }> = [];
  const add = function(step: IgStep, msg: string) { err.push({ step: step, msg: msg }); };
  const title = (i.title || '').trim();
  const text = (title + ' ' + (i.criteria || '')).toLowerCase().normalize('NFC');
  if (title.length < 15) add(1, 'Ghi rõ bạn sẽ làm gì, cho ai hoặc cái gì (ít nhất 15 ký tự).');
  const vague = IG_VAGUE.filter(function(w) { return text.indexOf(w) >= 0; });
  if (vague.length) add(1, 'Bỏ từ mơ hồ "' + vague.join('", "') + '". Một lời nói chỉ có làm được hoặc không.');
  if (!(typeof i.target === 'number' && isFinite(i.target) && i.target > 0)) add(1, 'Số lượng phải lớn hơn 0 (việc làm một lần thì ghi 1).');
  if (!(i.unit || '').trim()) add(1, 'Chọn hoặc ghi đơn vị đo (video, đơn, báo cáo...).');
  if ((i.criteria || '').trim().length < 10) add(1, 'Ghi nhìn vào đâu để biết đã xong (file, link, số liệu...), ít nhất 10 ký tự.');
  const due = Date.parse(igDueIso(i.dueDate || '', i.dueTime || ''));
  if (!isFinite(due)) add(2, 'Chọn ngày và giờ hoàn thành.');
  else if (due <= nowMs) add(2, 'Hạn hoàn thành phải ở tương lai.');
  if (!i.relatedIds || i.relatedIds.length === 0) add(3, 'Chọn ít nhất 1 người liên quan.');
  if (i.relatedIds && i.relatedIds.indexOf(ownerId) >= 0) add(3, 'Người liên quan là người khác, không phải chính bạn.');
  if (!i.verifierId) add(3, 'Chọn người nghiệm thu.');
  else if (i.verifierId === ownerId) add(3, 'Không tự nghiệm thu lời của mình.');
  if ((i.why || '').trim().length < 10) add(3, 'Ghi vì sao lời này quan trọng, ai bị ảnh hưởng (ít nhất 10 ký tự).');
  return err;
}

export function igCheckSmart(i: IgInput, ownerId: string, nowMs: number): string[] {
  return igSmartErrors(i, ownerId, nowMs).map(function(e) { return e.msg; });
}

// Cộng ngày trên chuỗi YYYY-MM-DD
export function igAddDays(date: string, n: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

// Hạn viết cho người đọc: "Hôm nay 18:00" + "còn 3 giờ" / "trễ 2 ngày"
export function igDueText(iso: string, nowMs: number): { when: string; left: string; late: boolean } {
  const day = igDay(iso);
  const today = igDay(new Date(nowMs).toISOString());
  const time = new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(11, 16);
  const dm = day.slice(8, 10) + '/' + day.slice(5, 7) + (day.slice(0, 4) !== today.slice(0, 4) ? '/' + day.slice(0, 4) : '');
  const weekdays = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const when = day === today ? 'Hôm nay ' + time
    : day === igAddDays(today, 1) ? 'Ngày mai ' + time
    : day === igAddDays(today, -1) ? 'Hôm qua ' + time
    : weekdays[new Date(day + 'T00:00:00Z').getUTCDay()] + ' ' + dm + ' ' + time;
  const diff = Date.parse(iso) - nowMs;
  const m = Math.floor(Math.abs(diff) / 60000);
  const span = m < 60 ? Math.max(1, m) + ' phút' : m < 1440 ? Math.floor(m / 60) + ' giờ' : Math.floor(m / 1440) + ' ngày';
  return { when: when, left: (diff < 0 ? 'trễ ' : 'còn ') + span, late: diff < 0 };
}

export type IgState = 'open' | 'pending' | 'overdue' | 'restoring' | 'kept' | 'restored-early' | 'restored-late' | 'void';

export const IG_STATE_LABEL: Record<IgState, string> = {
  'open': 'Đang thực hiện',
  'pending': 'Chờ nghiệm thu',
  'overdue': 'Quá hạn, chưa khôi phục',
  'restoring': 'Đang khôi phục',
  'kept': 'Giữ lời đúng hạn',
  'restored-early': 'Báo trước hạn, đã khôi phục',
  'restored-late': 'Khôi phục sau hạn',
  'void': 'Đã hủy',
};

export function igLastReport(c: IgCommit): IgReport | null {
  return c.reports.length ? c.reports[c.reports.length - 1] : null;
}

export function igState(c: IgCommit, nowMs: number): IgState {
  if (c.voided) return 'void';
  const due = Date.parse(c.due);
  const r = igLastReport(c);
  const onTime = !!r && Date.parse(r.at) <= due;
  if (r && onTime && r.verdict && r.verdict.ok) return 'kept';
  if (c.restore.step3) return Date.parse(c.restore.step3.at) <= due ? 'restored-early' : 'restored-late';
  if (r && onTime && !r.verdict) return 'pending';
  if (c.restore.step1) return 'restoring';
  return nowMs > due ? 'overdue' : 'open';
}

// Chủ lời nói đang nợ việc khôi phục
export function igNeedsRestore(c: IgCommit, nowMs: number): boolean {
  const s = igState(c, nowMs);
  return s === 'overdue' || s === 'restoring';
}

export function igSummary(items: IgCommit[], userId: string, nowMs: number): IgSummary {
  const out: IgSummary = { overdue: 0, dueToday: 0, toVerify: 0, news: 0 };
  const today = igDay(new Date(nowMs).toISOString());
  items.forEach(function(c) {
    if (c.voided) return;
    if (c.ownerId === userId) {
      if (igNeedsRestore(c, nowMs)) out.overdue++;
      else if (igState(c, nowMs) === 'open' && igDay(c.due) === today) out.dueToday++;
    }
    const r = igLastReport(c);
    if (c.verifierId === userId && r && !r.verdict) out.toVerify++;
    if (c.restore.step1 && c.restore.step1.toIds.indexOf(userId) >= 0 && !c.acks.some(function(a) { return a.userId === userId; })) out.news++;
  });
  return out;
}

// ==================== Đo lường ====================

export type IgPeriod = 'day' | 'week' | 'month';

export function igRange(p: IgPeriod, anchor: string): { from: string; to: string; label: string } {
  const dm = function(d: string) { return d.slice(8, 10) + '/' + d.slice(5, 7); };
  if (p === 'day') return { from: anchor, to: anchor, label: dm(anchor) };
  if (p === 'week') {
    const dow = (new Date(anchor + 'T00:00:00Z').getUTCDay() + 6) % 7; // Thứ Hai = 0
    const from = igAddDays(anchor, -dow);
    const to = igAddDays(from, 6);
    return { from: from, to: to, label: dm(from) + ' – ' + dm(to) };
  }
  const from = anchor.slice(0, 7) + '-01';
  const y = Number(anchor.slice(0, 4)), m = Number(anchor.slice(5, 7));
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from: from, to: to, label: 'T' + m + '/' + y };
}

// Lùi (n < 0) hoặc tiến n kỳ
export function igShift(p: IgPeriod, anchor: string, n: number): string {
  if (p === 'day') return igAddDays(anchor, n);
  if (p === 'week') return igAddDays(anchor, 7 * n);
  const y = Number(anchor.slice(0, 4)), m = Number(anchor.slice(5, 7));
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

export interface IgStats {
  total: number;
  kept: number;
  restoredEarly: number;
  restoredLate: number;
  broken: number; // đã quá hạn, chưa xong 3 bước
  pending: number;
  upcoming: number; // chưa tới hạn
  score: number | null; // % = (giữ đúng hạn + báo trước đã khôi phục) / số lời đã ngã ngũ
}

export function igStats(items: IgCommit[], from: string, to: string, nowMs: number): IgStats {
  const s: IgStats = { total: 0, kept: 0, restoredEarly: 0, restoredLate: 0, broken: 0, pending: 0, upcoming: 0, score: null };
  items.forEach(function(c) {
    const day = igDay(c.due);
    if (c.voided || day < from || day > to) return;
    s.total++;
    const st = igState(c, nowMs);
    if (st === 'kept') s.kept++;
    else if (st === 'restored-early') s.restoredEarly++;
    else if (st === 'restored-late') s.restoredLate++;
    else if (st === 'pending') s.pending++;
    else if (nowMs > Date.parse(c.due)) s.broken++;
    else s.upcoming++;
  });
  const done = s.kept + s.restoredEarly + s.restoredLate + s.broken;
  if (done) s.score = Math.round((s.kept + s.restoredEarly) * 100 / done);
  return s;
}

// ==================== Tin Lark ====================

function nameOf(users: IgUser[], id: string): string {
  const u = users.find(function(x) { return x.id === id; });
  return u ? u.name : '(đã nghỉ)';
}

export function igNewsText(c: IgCommit, users: IgUser[], link: string): string {
  const s = c.restore.step1!;
  return [
    '📣 LOAN TIN – ' + nameOf(users, c.ownerId),
    'Lời đã nói: ' + c.title + ' (' + c.target + ' ' + c.unit + ', hạn ' + igFmt(c.due) + ')',
    (Date.parse(s.at) <= Date.parse(c.due) ? 'Báo trước hạn: ' : 'Đã không giữ được đúng hạn: ') + s.message,
    'Người liên quan: ' + s.toIds.map(function(id) { return nameOf(users, id); }).join(', '),
    'Mở app để xác nhận đã nhận tin: ' + link,
  ].join('\n');
}

// Tin nhắc hằng ngày; trả chuỗi rỗng nếu không có gì cần nhắc
export function igReminderText(items: IgCommit[], users: IgUser[], nowMs: number, link: string): string {
  const today = igDay(new Date(nowMs).toISOString());
  const tomorrow = igAddDays(today, 1);
  const line = function(c: IgCommit) { return '• ' + nameOf(users, c.ownerId) + ': ' + c.title + ' (hạn ' + igFmt(c.due) + ')'; };
  const sorted = items.filter(function(c) { return !c.voided; }).sort(function(a, b) { return a.due.localeCompare(b.due); });
  const overdue = sorted.filter(function(c) { return igNeedsRestore(c, nowMs) && nowMs > Date.parse(c.due); });
  const dueToday = sorted.filter(function(c) { return igState(c, nowMs) === 'open' && igDay(c.due) === today; });
  const dueNext = sorted.filter(function(c) { return igState(c, nowMs) === 'open' && igDay(c.due) === tomorrow; });
  const waiting = sorted.filter(function(c) { const r = igLastReport(c); return !!r && !r.verdict; });
  const out: string[] = [];
  const block = function(title: string, list: IgCommit[], fn: (c: IgCommit) => string) {
    if (!list.length) return;
    out.push('', title + ' (' + list.length + ')');
    list.slice(0, 20).forEach(function(c) { out.push(fn(c)); });
    if (list.length > 20) out.push('… và ' + (list.length - 20) + ' lời khác');
  };
  block('🔴 QUÁ HẠN – cần làm đủ 3 bước khôi phục', overdue, line);
  block('🟠 ĐẾN HẠN HÔM NAY', dueToday, line);
  block('🟡 ĐẾN HẠN NGÀY MAI', dueNext, line);
  block('🔵 CHỜ NGHIỆM THU', waiting, function(c) { return '• ' + nameOf(users, c.verifierId) + ' nghiệm thu cho ' + nameOf(users, c.ownerId) + ': ' + c.title; });
  if (!out.length) return '';
  return ['🤝 INTEGRITY – Trân trọng lời nói của mình (' + today.slice(8, 10) + '/' + today.slice(5, 7) + ')'].concat(out, ['', 'Làm đúng, đủ điều đã nói. Thấy nguy cơ thì báo ngay: ' + link]).join('\n');
}

// ==================== Báo ngay khi quá hạn ====================

export const IG_NOTICE_MAX = 20; // số lời tối đa trong một tin; phần còn lại gửi ở lượt chạy sau

// Lời vừa quá hạn, còn phải khôi phục và chưa được báo lần nào
export function igNewOverdue(items: IgCommit[], nowMs: number): IgCommit[] {
  return items.filter(function(c) { return !c.overdueNoticeAt && nowMs > Date.parse(c.due) && igNeedsRestore(c, nowMs); })
    .sort(function(a, b) { return a.due.localeCompare(b.due); })
    .slice(0, IG_NOTICE_MAX);
}

export function igOverdueText(list: IgCommit[], users: IgUser[], link: string): string {
  const out = ['🔴 INTEGRITY – VỪA QUÁ HẠN (' + list.length + ')'];
  list.forEach(function(c) {
    const step = !c.restore.step1 ? 'chưa báo tin' : !c.restore.step2 ? 'đã báo tin, còn bước 2 và 3' : 'còn bước 3';
    out.push('', '• ' + nameOf(users, c.ownerId) + ': ' + c.title, '  Hạn ' + igFmt(c.due) + ' · ' + step,
      '  Liên quan: ' + c.relatedIds.map(function(id) { return nameOf(users, id); }).join(', ') + ' · Nghiệm thu: ' + nameOf(users, c.verifierId));
  });
  out.push('', 'Làm đủ 3 bước khôi phục: báo cho người liên quan → tác động và khắc phục → hứa lại (nếu có).', link);
  return out.join('\n');
}
