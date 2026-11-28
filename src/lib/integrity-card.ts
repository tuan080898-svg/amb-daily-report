// Thẻ tương tác Lark (JSON 2.0) cho lời cam kết: báo xong, 3 bước khôi phục, nghiệm thu, xác nhận nhận tin.
// Không đọc/ghi gì. Quyền không dựa vào dữ liệu trong nút bấm: máy chủ kiểm tra người bấm.
import { igAddDays, igDay, igDueIso, igFmt, igLastReport, igState } from './integrity';
import type { IgCommit, IgState, IgUser } from './integrity';

export type IgView = 'owner' | 'verify' | 'news';
export type IgMode = 'report' | 'restore';

// Giá trị gắn trong nút bấm
export interface IgButton { a: string; o: string; i: string; v: IgView; m?: IgMode; d?: string }

type El = Record<string, unknown>;

// Chữ người dùng gõ không được tạo thẻ (ví dụ nhắc cả nhóm) trong thẻ Lark
const safe = (s: string) => String(s).replace(/</g, '‹').replace(/>/g, '›');
const nameOf = (users: IgUser[], id: string) => { const u = users.find(function(x) { return x.id === id; }); return u ? safe(u.name) : '(đã nghỉ)'; };
const md = (content: string): El => ({ tag: 'markdown', content: content });
const plainText = (content: string) => ({ tag: 'plain_text', content: content });

function button(text: string, type: string, value: IgButton | Record<string, string>, formName?: string): El {
  const b: El = { tag: 'button', type: type, text: plainText(text), behaviors: [{ type: 'callback', value: value }] };
  if (formName) { b.name = formName; b.form_action_type = 'submit'; }
  return b;
}

function row(buttons: El[]): El {
  return { tag: 'column_set', flex_mode: 'flow', columns: buttons.map(function(b) { return { tag: 'column', width: 'auto', elements: [b] }; }) };
}

function input(name: string, label: string, opts: { placeholder?: string; multi?: boolean; required?: boolean; max?: number }): El {
  const el: El = { tag: 'input', name: name, label: plainText(label), label_position: 'top', required: !!opts.required, max_length: opts.max || 1000 };
  if (opts.placeholder) el.placeholder = plainText(opts.placeholder);
  if (opts.multi) { el.input_type = 'multiline_text'; el.rows = 3; }
  return el;
}

const form = (name: string, elements: El[]): El => ({ tag: 'form', name: name, elements: elements });

function card(title: string, color: string, elements: El[]): Record<string, unknown> {
  return { schema: '2.0', config: { update_multi: true }, header: { title: plainText(title), template: color }, body: { elements: elements } };
}

const COLOR: Record<IgState, string> = {
  'open': 'blue', 'pending': 'purple', 'overdue': 'red', 'restoring': 'orange',
  'kept': 'green', 'restored-early': 'turquoise', 'restored-late': 'yellow', 'void': 'grey',
};

export function igPingCard(name: string): Record<string, unknown> {
  return card('🔔 Integrity – thẻ thử', 'blue', [
    md('Chào ' + safe(name) + '. Gõ vài chữ rồi bấm nút để kiểm tra app nhận được phản hồi từ Lark.'),
    // Có cả ô nhập và nút gửi để thử đúng loại thẻ sẽ dùng thật
    form('f_ping', [input('text', 'Gõ thử', { required: true, max: 100 }), button('Gửi thử', 'primary_filled', { a: 'ping' }, 'b_ping')]),
  ]);
}

export function igCard(c: IgCommit, view: IgView, users: IgUser[], nowMs: number, link: string, mode?: IgMode): Record<string, unknown> {
  const state = igState(c, nowMs);
  const report = igLastReport(c);
  const waiting = !!report && !report.verdict;
  const late = nowMs > Date.parse(c.due);
  const val = function(a: string, extra?: Partial<IgButton>): IgButton { return Object.assign({ a: a, o: c.ownerId, i: c.id, v: view }, extra || {}); };
  const info = md('**' + safe(c.title) + '**\nChỉ tiêu: ' + c.target + ' ' + safe(c.unit) + ' · Hạn: ' + igFmt(c.due) + (late && state !== 'kept' ? ' (đã qua)' : '') +
    (view === 'owner' ? '\nNghiệm thu: ' + nameOf(users, c.verifierId) : '\nNgười cam kết: ' + nameOf(users, c.ownerId)));
  const open = md('[Mở trong app](' + link + ')');
  const out: El[] = [info];

  if (c.voided) return card('Lời cam kết đã hủy', 'grey', out.concat([md(safe(c.voided.reason)), open]));

  if (view === 'news') {
    const s = c.restore.step1;
    if (!s) return card('Integrity', 'grey', out.concat([open]));
    const acked = function(id: string) { return c.acks.some(function(a) { return a.userId === id; }); };
    out.push(md('📣 ' + nameOf(users, c.ownerId) + ' báo: ' + safe(s.message)));
    const left = s.toIds.filter(function(id) { return !acked(id); });
    out.push(left.length ? button('👍 Đã nhận tin', 'primary', val('ack')) : md('✓ Mọi người đã nhận tin'));
    return card('Tin về một lời cam kết liên quan tới bạn', 'orange', out.concat([open]));
  }

  if (view === 'verify') {
    if (!report) return card('Chưa có kết quả để nghiệm thu', 'grey', out.concat([open]));
    out.push(md('**Kết quả báo: ' + report.actual + ' / ' + c.target + ' ' + safe(c.unit) + '**' + (Date.parse(report.at) > Date.parse(c.due) ? ' (báo trễ hạn)' : '') +
      '\nBằng chứng: ' + safe(report.evidence) + '\nTiêu chí: ' + safe(c.criteria)));
    if (report.verdict) {
      out.push(md((report.verdict.ok ? '✅ Đạt' : '❌ Chưa đạt') + ' — ' + nameOf(users, report.verdict.by) + (report.verdict.note ? ': ' + safe(report.verdict.note) : '')));
      return card('Đã nghiệm thu', report.verdict.ok ? 'green' : 'red', out.concat([open]));
    }
    out.push(form('f_verify', [
      input('note', 'Nhận xét (bắt buộc nếu chưa đạt)', { multi: true, max: 600 }),
      row([button('✅ Đạt', 'primary_filled', val('ok'), 'b_ok'), button('❌ Chưa đạt', 'danger', val('no'), 'b_no')]),
    ]));
    return card('Chờ bạn nghiệm thu', 'purple', out.concat([open]));
  }

  // ==================== Người cam kết ====================
  if (state === 'kept') return card('✅ Bạn đã giữ lời', 'green', out.concat([open]));
  if (state === 'restored-early' || state === 'restored-late') {
    const s3 = c.restore.step3!;
    out.push(md('Đã làm đủ 3 bước khôi phục.' + (s3.newId ? ' Lời hứa mới đã được ghi.' : s3.note ? ' Không hứa lại: ' + safe(s3.note) : '')));
    return card('Đã khôi phục Integrity', COLOR[state], out.concat([open]));
  }

  const accepted = !!report && !!report.verdict && report.verdict.ok;
  const canReport = !waiting && !accepted;
  const mustRestore = state === 'overdue' || state === 'restoring';
  if (waiting) out.push(md('Đã báo xong: ' + report!.actual + ' ' + safe(c.unit) + '. Đang chờ ' + nameOf(users, c.verifierId) + ' nghiệm thu.'));
  if (report && report.verdict && !report.verdict.ok) out.push(md('❌ Chưa đạt: ' + safe(report.verdict.note)));
  const current: IgMode = mode === 'report' && canReport ? 'report' : mode === 'restore' || mustRestore || !canReport ? 'restore' : 'report';

  // Báo đúng hạn đang chờ nghiệm thu: không còn gì phải làm
  if (state === 'pending' && mode !== 'restore' && !c.restore.step1) return card('Đang chờ nghiệm thu', 'purple', out.concat([open]));

  if (current === 'report') {
    out.push(form('f_report', [
      input('actual', 'Làm được bao nhiêu ' + c.unit + '? (chỉ tiêu ' + c.target + ')', { required: true, max: 20, placeholder: 'Nhập số' }),
      input('evidence', 'Bằng chứng', { required: true, multi: true, placeholder: 'Link, tên file, số liệu... Cần có: ' + c.criteria.slice(0, 80) }),
      button('✅ Báo xong', 'primary_filled', val('report'), 'b_report'),
    ]));
    out.push(button(c.restore.step1 ? 'Làm tiếp bước khôi phục' : '⚠️ Không kịp?', 'default', val('mode', { m: 'restore' })));
  } else {
    const step = !c.restore.step1 ? 1 : !c.restore.step2 ? 2 : 3;
    out.push(md('**Khôi phục Integrity – bước ' + step + '/3**'));
    if (step === 1) {
      const tell = Array.from(new Set(c.relatedIds.concat([c.verifierId]))).map(function(id) { return nameOf(users, id); }).join(', ');
      out.push(form('f_r1', [
        input('message', 'Chuyện gì xảy ra với lời bạn đã nói? (ít nhất 20 ký tự)', { required: true, multi: true, placeholder: 'VD: Mới đăng được 9 video vì thiếu hàng mẫu, không kịp hạn.' }),
        md('Sẽ báo tới: ' + tell),
        button('Gửi tin cho mọi người', 'primary_filled', val('r1'), 'b_r1'),
      ]));
    } else if (step === 2) {
      out.push(form('f_r2', [
        input('impact', 'Ảnh hưởng tới ai, tới việc gì? (ít nhất 20 ký tự)', { required: true, multi: true }),
        input('fix', 'Bạn khắc phục thế nào? (ít nhất 20 ký tự)', { required: true, multi: true }),
        button('Lưu và sang bước 3', 'primary_filled', val('r2'), 'b_r2'),
      ]));
    } else {
      const today = igDay(new Date(nowMs).toISOString());
      const presets = ([['Hôm nay 18:00', today], ['Ngày mai 18:00', igAddDays(today, 1)], ['3 ngày nữa 18:00', igAddDays(today, 3)]] as Array<[string, string]>)
        .filter(function(p) { return Date.parse(igDueIso(p[1], '18:00')) > nowMs; });
      out.push(md('Bạn hứa lại với hạn mới nào? Nội dung và người liên quan giữ nguyên.'));
      out.push(row(presets.map(function(p) { return button(p[0], 'primary', val('r3new', { d: p[1] + ' 18:00' })); })));
      out.push(form('f_due', [
        input('due', 'Hoặc hạn khác (giờ ngày/tháng)', { required: true, max: 20, placeholder: 'VD: 17:00 05/12' }),
        button('Hứa lại với hạn này', 'default', val('r3custom'), 'b_due'),
      ]));
      out.push(form('f_none', [
        input('note', 'Hoặc không hứa lại, vì sao?', { required: true, multi: true, max: 600 }),
        button('Không hứa lại', 'default', val('r3none'), 'b_none'),
      ]));
    }
    if (canReport) out.push(button('Tôi đã làm xong', 'default', val('mode', { m: 'report' })));
  }

  const title = state === 'overdue' ? '🔴 Quá hạn – cần khôi phục' : state === 'restoring' ? 'Đang khôi phục Integrity' : state === 'pending' ? 'Đang chờ nghiệm thu' : 'Lời bạn đã cam kết';
  return card(title, COLOR[state], out.concat([open]));
}

// Đọc hạn người dùng gõ: "17:00 05/12", "05/12 17h", "05/12/2027 8:30". Trả null nếu không hiểu.
export function igParseDue(text: string, nowMs: number): { date: string; time: string } | null {
  const d = /(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?=\s|$)/.exec(text);
  const t = /(?:^|\s)(\d{1,2})(?::|h)(\d{2})?(?=\s|$)/i.exec(text);
  if (!d || !t) return null;
  const today = igDay(new Date(nowMs).toISOString());
  // Không ghi năm: tháng đã qua thì hiểu là năm sau
  const year = d[3] ? Number(d[3]) : Number(today.slice(0, 4)) + (Number(d[2]) < Number(today.slice(5, 7)) ? 1 : 0);
  const month = Number(d[2]), day = Number(d[1]), hour = Number(t[1]), minute = Number(t[2] || 0);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  const pad = function(n: number) { return String(n).padStart(2, '0'); };
  return { date: year + '-' + pad(month) + '-' + pad(day), time: pad(hour) + ':' + pad(minute) };
}
