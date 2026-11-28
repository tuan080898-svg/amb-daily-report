'use client';

import { useState } from 'react';
import { igAddDays, igDay, igDueText, igLastReport, type IgCommit, type IgUser } from '@/lib/integrity';
import CommitForm from './CommitForm';
import Dialog from './Dialog';
import { btnCls, btnDangerCls, btnPrimaryCls, chipCls, hintCls, inputCls, labelCls, nameOf, type Act, type DialogKind } from './ui';

var TITLE: Record<DialogKind, string> = { report: 'Báo đã làm xong', verify: 'Nghiệm thu kết quả', restore: 'Khôi phục Integrity', void: 'Hủy lời ghi nhầm' };

// Nói rõ còn thiếu gì thay vì chỉ làm mờ nút
function need(text: string, min: number): string {
  var n = min - text.trim().length;
  return n > 0 ? 'Viết thêm ít nhất ' + n + ' ký tự' : '';
}

export default function ActionDialog(props: { kind: DialogKind; c: IgCommit; users: IgUser[]; meId: string; nowIso: string; busy: boolean; act: Act; onClose: () => void }) {
  var c = props.c, users = props.users, me = props.meId;
  var key = { ownerId: c.ownerId, id: c.id };
  var report = igLastReport(c);
  var nowMs = Date.parse(props.nowIso);
  var due = igDueText(c.due, nowMs);
  var [actual, setActual] = useState('');
  var [text, setText] = useState('');
  var [impact, setImpact] = useState('');
  var [fix, setFix] = useState('');
  var [withNew, setWithNew] = useState(true);
  var [extra, setExtra] = useState<string[]>([]);
  var step = !c.restore.step1 ? 1 : !c.restore.step2 ? 2 : 3;
  // Bước 1 phải gửi tới mọi người liên quan và người nghiệm thu
  var mustTell = Array.from(new Set(c.relatedIds.concat([c.verifierId]))).filter(function(id) { return users.some(function(u) { return u.id === id; }); });

  async function send(action: string, payload: Record<string, unknown>, done: string, close: boolean) {
    if (await props.act(action, Object.assign({}, key, payload), done) && close) props.onClose();
  }

  return (
    <Dialog title={TITLE[props.kind]} onClose={props.onClose}>
      <div className="bg-slate-800/60 rounded-lg p-3 mb-4 text-sm break-words">
        <p className="font-semibold text-gray-100">{c.title}</p>
        <p className="text-gray-400 mt-0.5">{nameOf(users, c.ownerId)} · {c.target} {c.unit} · {due.when} <span className={due.late ? 'text-red-300' : ''}>({due.left})</span></p>
      </div>

      {props.kind === 'report' && (
        <div className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="ig-actual">Làm được bao nhiêu {c.unit}? (chỉ tiêu {c.target})</label>
            <div className="flex gap-2">
              <input id="ig-actual" className={inputCls} inputMode="decimal" value={actual} onChange={function(e) { setActual(e.target.value); }} placeholder="Nhập số" />
              <button type="button" className={btnCls + ' whitespace-nowrap'} onClick={function() { setActual(String(c.target)); }}>Đủ {c.target}</button>
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="ig-evidence">Bằng chứng</label>
            <textarea id="ig-evidence" className={inputCls} rows={4} maxLength={1000} value={text} onChange={function(e) { setText(e.target.value); }} placeholder="Dán link, tên file, số liệu..." />
            <p className={hintCls}>Cần có: {c.criteria}</p>
          </div>
          <button className={btnPrimaryCls + ' w-full'} disabled={props.busy || !(actual.trim() && isFinite(Number(actual.replace(',', '.')))) || text.trim().length < 5}
            onClick={function() { send('report', { actual: Number(actual.replace(',', '.')), evidence: text }, 'Đã gửi cho ' + nameOf(users, c.verifierId) + ' nghiệm thu', true); }}>
            Gửi {nameOf(users, c.verifierId)} nghiệm thu
          </button>
        </div>
      )}

      {props.kind === 'verify' && report && !report.verdict && (
        <div className="space-y-4 text-sm text-gray-300 break-words">
          <p>Kết quả báo: <b className="text-lg text-gray-100">{report.actual} / {c.target} {c.unit}</b></p>
          <div><p className="text-gray-500">Bằng chứng</p><p className="whitespace-pre-wrap">{report.evidence}</p></div>
          <div><p className="text-gray-500">Tiêu chí đã thống nhất</p><p>{c.criteria}</p></div>
          <textarea aria-label="Nhận xét" className={inputCls} rows={2} maxLength={600} value={text} onChange={function(e) { setText(e.target.value); }} placeholder="Nhận xét (bắt buộc nếu chưa đạt: còn thiếu gì?)" />
          <div className="flex gap-2">
            <button className={btnDangerCls + ' flex-1'} disabled={props.busy || text.trim().length < 5} onClick={function() { send('verdict', { ok: false, note: text }, 'Đã ghi: chưa đạt', true); }}>Chưa đạt</button>
            <button className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg disabled:opacity-40" disabled={props.busy}
              onClick={function() { send('verdict', { ok: true, note: text }, 'Đã nghiệm thu: đạt', true); }}>Đạt ✓</button>
          </div>
        </div>
      )}

      {props.kind === 'restore' && (
        <div className="space-y-4">
          <div className="flex gap-1.5">
            {['Báo cho mọi người', 'Tác động & sửa', 'Lời hứa mới'].map(function(t, i) {
              return <span key={t} className={'flex-1 text-center rounded-lg px-1 py-2 text-xs font-medium ' + (i + 1 === step ? 'bg-orange-500 text-white' : i + 1 < step ? 'bg-green-500/20 text-green-300' : 'bg-slate-800 text-gray-500')}>{i + 1 < step ? '✓' : i + 1} {t}</span>;
            })}
          </div>

          {step === 1 && (
            <>
              <div>
                <label className={labelCls} htmlFor="ig-news">Chuyện gì xảy ra với lời bạn đã nói?</label>
                <textarea id="ig-news" className={inputCls} rows={4} maxLength={1000} value={text} onChange={function(e) { setText(e.target.value); }}
                  placeholder="VD: Hiện mới đăng được 9 video vì thiếu hàng mẫu, không kịp hạn đã hứa." />
                <p className={hintCls}>{need(text, 20)}</p>
              </div>
              <div className="text-sm text-gray-300">
                <p>Tin sẽ gửi vào nhóm Lark và báo tới: <b>{mustTell.concat(extra).map(function(id) { return nameOf(users, id); }).join(', ')}</b></p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {users.filter(function(u) { return u.id !== me && mustTell.indexOf(u.id) < 0; }).map(function(u) {
                    var on = extra.indexOf(u.id) >= 0;
                    return <button key={u.id} type="button" aria-pressed={on} className={chipCls(on)}
                      onClick={function() { setExtra(on ? extra.filter(function(x) { return x !== u.id; }) : extra.concat([u.id])); }}>{on ? '✓ ' : '+ '}{u.name}</button>;
                  })}
                </div>
              </div>
              <button className={btnPrimaryCls + ' w-full'} disabled={props.busy || text.trim().length < 20}
                onClick={function() { send('restore1', { message: text, toIds: mustTell.concat(extra) }, 'Đã báo cho mọi người (bước 1/3)', false); }}>Gửi tin và sang bước 2</button>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className={labelCls} htmlFor="ig-impact">Việc này ảnh hưởng tới ai, tới việc gì?</label>
                <textarea id="ig-impact" className={inputCls} rows={3} maxLength={1500} value={impact} onChange={function(e) { setImpact(e.target.value); }} placeholder="Nên hỏi trực tiếp người liên quan rồi ghi lại." />
                <p className={hintCls}>{need(impact, 20)}</p>
              </div>
              <div>
                <label className={labelCls} htmlFor="ig-fix">Bạn khắc phục thế nào?</label>
                <textarea id="ig-fix" className={inputCls} rows={3} maxLength={1500} value={fix} onChange={function(e) { setFix(e.target.value); }} placeholder="Việc cụ thể bạn làm để giảm thiệt hại." />
                <p className={hintCls}>{need(fix, 20)}</p>
              </div>
              <button className={btnPrimaryCls + ' w-full'} disabled={props.busy || impact.trim().length < 20 || fix.trim().length < 20}
                onClick={function() { send('restore2', { impact: impact, fix: fix }, 'Đã lưu (bước 2/3)', false); }}>Lưu và sang bước 3</button>
            </>
          )}

          {step === 3 && !c.restore.step3 && (
            <>
              <p className={labelCls}>Bạn có hứa lại không?</p>
              <div className="flex gap-1.5">
                <button type="button" aria-pressed={withNew} className={chipCls(withNew)} onClick={function() { setWithNew(true); }}>Có, hứa hạn mới</button>
                <button type="button" aria-pressed={!withNew} className={chipCls(!withNew)} onClick={function() { setWithNew(false); }}>Không</button>
              </div>
              {withNew ? (
                <CommitForm users={users} ownerId={me} nowIso={props.nowIso} busy={props.busy} quick submitLabel="Hứa lại và hoàn tất"
                  initial={{ title: c.title, target: c.target, unit: c.unit, criteria: c.criteria, why: c.why, verifierId: c.verifierId, relatedIds: c.relatedIds, dueDate: igAddDays(igDay(props.nowIso), 1) }}
                  onSubmit={function(i) { send('restore3', { newCommit: i, note: '' }, 'Đã khôi phục xong 3 bước', true); }} />
              ) : (
                <>
                  <div>
                    <textarea aria-label="Lý do không hứa lại" className={inputCls} rows={3} maxLength={600} value={text} onChange={function(e) { setText(e.target.value); }} placeholder="Vì sao không hứa lại? VD: việc này không còn cần làm vì..." />
                    <p className={hintCls}>{need(text, 10)}</p>
                  </div>
                  <button className={btnPrimaryCls + ' w-full'} disabled={props.busy || text.trim().length < 10} onClick={function() { send('restore3', { note: text }, 'Đã khôi phục xong 3 bước', true); }}>Hoàn tất</button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {props.kind === 'void' && (
        <div className="space-y-3">
          <textarea aria-label="Lý do hủy" className={inputCls} rows={3} maxLength={300} value={text} onChange={function(e) { setText(e.target.value); }} placeholder="Lý do hủy (ghi nhầm, trùng...)" />
          <p className={hintCls}>{need(text, 10)}</p>
          <button className={btnDangerCls + ' w-full'} disabled={props.busy || text.trim().length < 10} onClick={function() { send('void', { reason: text }, 'Đã hủy', true); }}>Xác nhận hủy</button>
        </div>
      )}
    </Dialog>
  );
}
