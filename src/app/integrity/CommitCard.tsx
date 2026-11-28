'use client';

import { useState } from 'react';
import { IG_CANCEL_MINUTES, IG_STATE_LABEL, igFmt, igLastReport, igState, type IgCommit, type IgUser } from '@/lib/integrity';
import CommitForm from './CommitForm';
import { BADGE, btnCls, btnPrimaryCls, cardCls, inputCls, labelCls, nameOf, type Act } from './ui';

export default function CommitCard(props: { c: IgCommit; users: IgUser[]; meId: string; isAdmin: boolean; nowIso: string; busy: boolean; act: Act; startOpen?: boolean }) {
  var c = props.c, users = props.users, me = props.meId, act = props.act;
  var nowMs = Date.parse(props.nowIso);
  var state = igState(c, nowMs);
  var mine = c.ownerId === me;
  var report = igLastReport(c);
  var waiting = !!report && !report.verdict;
  var live = state === 'open' || state === 'pending' || state === 'overdue' || state === 'restoring';
  var missed = live && nowMs > Date.parse(c.due) && state !== 'pending';
  var accepted = !!report && !!report.verdict && report.verdict.ok;
  var canReport = mine && live && !waiting && !accepted;
  var canVerify = waiting && !mine && !c.voided && (c.verifierId === me || props.isAdmin);
  var canCancel = mine && !c.voided && !c.fromId && !c.reports.length && !c.restore.step1 && nowMs - Date.parse(c.createdAt) <= IG_CANCEL_MINUTES * 60000;
  var needAck = !c.voided && !!c.restore.step1 && c.restore.step1.toIds.indexOf(me) >= 0 && !c.acks.some(function(a) { return a.userId === me; });

  var [open, setOpen] = useState(!!props.startOpen);
  var [panel, setPanel] = useState<'' | 'report' | 'restore' | 'void'>('');
  var [actual, setActual] = useState('');
  var [text, setText] = useState('');
  var [impact, setImpact] = useState('');
  var [fix, setFix] = useState('');
  var [withNew, setWithNew] = useState(true);
  var key = { ownerId: c.ownerId, id: c.id };
  var step = !c.restore.step1 ? 1 : !c.restore.step2 ? 2 : !c.restore.step3 ? 3 : 0;
  // Bước 1 phải gửi tới mọi người liên quan và người nghiệm thu
  var mustTell = Array.from(new Set(c.relatedIds.concat([c.verifierId]))).filter(function(id) { return users.some(function(u) { return u.id === id; }); });
  var [extra, setExtra] = useState<string[]>([]);

  function show(p: typeof panel) { setPanel(panel === p ? '' : p); setText(''); setActual(''); setOpen(true); }

  async function send(action: string, payload: Record<string, unknown>, done: string) {
    if (await act(action, Object.assign({}, key, payload), done)) { setPanel(''); setText(''); }
  }

  return (
    <div className={cardCls + (state === 'overdue' ? ' !border-red-500/70' : '')}>
      <button type="button" className="w-full text-left" aria-expanded={open} onClick={function() { setOpen(!open); }}>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className={'px-2 py-0.5 rounded-md text-xs font-medium ' + BADGE[state]}>{IG_STATE_LABEL[state]}</span>
          {missed && state === 'restoring' && <span className="text-xs text-red-300">đã quá hạn</span>}
          {c.fromId && <span className="text-xs text-teal-300">Lời nói mới</span>}
          <span className="text-xs text-gray-500 ml-auto">Hạn {igFmt(c.due)}</span>
        </div>
        <p className={'text-sm font-medium break-words ' + (c.voided ? 'text-gray-500 line-through' : 'text-gray-100')}>{c.title}</p>
        <p className="text-xs text-gray-400 mt-1">
          <b className="text-gray-300">{nameOf(users, c.ownerId)}</b> · Chỉ tiêu {c.target} {c.unit} · Liên quan: {c.relatedIds.map(function(id) { return nameOf(users, id); }).join(', ')} · {open ? 'Thu gọn ▲' : 'Chi tiết ▼'}
        </p>
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2 text-sm text-gray-300 break-words">
          <p><span className="text-gray-500">Vì sao quan trọng:</span> {c.why}</p>
          <p><span className="text-gray-500">Nghiệm thu:</span> {c.criteria} — <b>{nameOf(users, c.verifierId)}</b></p>
          <p className="text-xs text-gray-500">Ghi lúc {igFmt(c.createdAt)}</p>
          {c.voided && <p className="text-gray-400">Đã hủy bởi {nameOf(users, c.voided.by)} lúc {igFmt(c.voided.at)}: {c.voided.reason}</p>}
          {c.reports.map(function(r) {
            return (
              <div key={r.at} className="bg-slate-800/60 rounded-lg p-2.5">
                <p>📤 Báo hoàn thành {igFmt(r.at)}{Date.parse(r.at) > Date.parse(c.due) ? ' (trễ hạn)' : ''}: <b>{r.actual} / {c.target} {c.unit}</b></p>
                <p className="whitespace-pre-wrap">{r.evidence}</p>
                {r.verdict
                  ? <p className={r.verdict.ok ? 'text-green-300' : 'text-red-300'}>{r.verdict.ok ? '✅ Đạt' : '❌ Không đạt'} — {nameOf(users, r.verdict.by)}, {igFmt(r.verdict.at)}{r.verdict.note ? ': ' + r.verdict.note : ''}</p>
                  : <p className="text-violet-300">Chờ {nameOf(users, c.verifierId)} nghiệm thu</p>}
              </div>
            );
          })}
          {c.restore.step1 && (
            <div className="bg-slate-800/60 rounded-lg p-2.5 space-y-1.5">
              <p className="font-medium text-orange-300">Khôi phục Integrity</p>
              <p><b>1. Loan tin</b> ({igFmt(c.restore.step1.at)}){c.restore.step1.larkSent ? ' · đã gửi Lark' : ' · chưa gửi Lark'}: {c.restore.step1.message}</p>
              <p className="text-xs text-gray-400">
                {c.restore.step1.toIds.map(function(id) { return nameOf(users, id) + (c.acks.some(function(a) { return a.userId === id; }) ? ' ✓ đã nhận' : ' (chưa xác nhận)'); }).join(' · ')}
              </p>
              {c.restore.step2 && <p><b>2. Tác động</b> ({igFmt(c.restore.step2.at)}): {c.restore.step2.impact}<br /><b>Khắc phục:</b> {c.restore.step2.fix}</p>}
              {c.restore.step3 && <p><b>3. Lời nói mới</b> ({igFmt(c.restore.step3.at)}): {c.restore.step3.newId ? 'đã ghi một lời nói mới' : 'không có lời mới'}{c.restore.step3.note ? ' — ' + c.restore.step3.note : ''}</p>}
            </div>
          )}
        </div>
      )}

      {(canReport || canVerify || canCancel || needAck || (mine && live && step > 0) || (props.isAdmin && !c.voided && open)) && (
        <div className="flex flex-wrap gap-2 mt-3">
          {canReport && <button className={btnPrimaryCls} disabled={props.busy} onClick={function() { show('report'); }}>Báo hoàn thành</button>}
          {mine && live && step > 0 && (
            <button disabled={props.busy} onClick={function() { show('restore'); }}
              className={'px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 ' + (missed ? 'bg-red-600 hover:bg-red-500 text-white' : 'border border-orange-500/60 text-orange-300 hover:bg-orange-500/10')}>
              {c.restore.step1 ? 'Làm tiếp bước ' + step + '/3' : missed ? 'Khôi phục Integrity (3 bước)' : 'Có nguy cơ không kịp'}
            </button>
          )}
          {canVerify && <button className={btnPrimaryCls} disabled={props.busy} onClick={function() { show('report'); }}>Nghiệm thu</button>}
          {needAck && <button className={btnCls} disabled={props.busy} onClick={function() { send('ack', {}, 'Đã xác nhận nhận tin'); }}>👍 Tôi đã nhận tin</button>}
          {canCancel && <button className={btnCls} disabled={props.busy} onClick={function() { if (window.confirm('Rút lại lời vừa ghi?')) send('cancel', {}, 'Đã rút lại'); }}>Rút lại</button>}
          {props.isAdmin && !c.voided && open && <button className={btnCls} disabled={props.busy} onClick={function() { show('void'); }}>Hủy (admin)</button>}
        </div>
      )}

      {panel === 'report' && canReport && (
        <div className="mt-3 space-y-2">
          <div>
            <label className={labelCls}>Kết quả thực tế ({c.unit}), chỉ tiêu {c.target}</label>
            <input className={inputCls} inputMode="decimal" value={actual} onChange={function(e) { setActual(e.target.value); }} />
          </div>
          <div>
            <label className={labelCls}>Bằng chứng: {c.criteria}</label>
            <textarea className={inputCls} rows={3} maxLength={1000} value={text} onChange={function(e) { setText(e.target.value); }} placeholder="Dán link, tên file, số liệu..." />
          </div>
          <button className={btnPrimaryCls} disabled={props.busy || actual.trim() === '' || text.trim().length < 5}
            onClick={function() { send('report', { actual: Number(actual.replace(',', '.')), evidence: text }, 'Đã gửi, chờ nghiệm thu'); }}>Gửi nghiệm thu</button>
        </div>
      )}

      {panel === 'report' && canVerify && report && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-gray-300">Đối chiếu kết quả <b>{report.actual} / {c.target} {c.unit}</b> và bằng chứng với tiêu chí: {c.criteria}</p>
          <textarea className={inputCls} rows={2} maxLength={600} value={text} onChange={function(e) { setText(e.target.value); }} placeholder="Nhận xét (bắt buộc nếu không đạt)" />
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg disabled:opacity-50" disabled={props.busy}
              onClick={function() { send('verdict', { ok: true, note: text }, 'Đã nghiệm thu: đạt'); }}>✅ Đạt</button>
            <button className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg disabled:opacity-50" disabled={props.busy || text.trim().length < 5}
              onClick={function() { send('verdict', { ok: false, note: text }, 'Đã ghi: không đạt'); }}>❌ Không đạt</button>
          </div>
        </div>
      )}

      {panel === 'void' && (
        <div className="mt-3 space-y-2">
          <textarea className={inputCls} rows={2} maxLength={300} value={text} onChange={function(e) { setText(e.target.value); }} placeholder="Lý do hủy (ghi nhầm, trùng...)" />
          <button className={btnCls} disabled={props.busy || text.trim().length < 10} onClick={function() { send('void', { reason: text }, 'Đã hủy'); }}>Xác nhận hủy</button>
        </div>
      )}

      {panel === 'restore' && mine && live && step > 0 && (
        <div className="mt-3 border border-orange-500/40 rounded-xl p-3 space-y-3">
          <div className="flex gap-1 text-xs">
            {['1. Loan tin', '2. Tác động & khắc phục', '3. Lời nói mới'].map(function(t, i) {
              return <span key={t} className={'flex-1 text-center rounded-md px-1 py-1.5 ' + (i + 1 === step ? 'bg-orange-500 text-white font-medium' : i + 1 < step ? 'bg-green-500/20 text-green-300' : 'bg-slate-800 text-gray-500')}>{t}</span>;
            })}
          </div>

          {step === 1 && (
            <>
              <p className="text-sm text-gray-300">Sẽ báo tới: <b>{mustTell.concat(extra).map(function(id) { return nameOf(users, id); }).join(', ')}</b></p>
              <div className="flex flex-wrap gap-1.5">
                {users.filter(function(u) { return u.id !== me && mustTell.indexOf(u.id) < 0; }).map(function(u) {
                  var on = extra.indexOf(u.id) >= 0;
                  return <button key={u.id} type="button" aria-pressed={on} className={'px-2.5 py-1 rounded-full text-xs border ' + (on ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600 text-gray-400')}
                    onClick={function() { setExtra(on ? extra.filter(function(x) { return x !== u.id; }) : extra.concat([u.id])); }}>+ {u.name}</button>;
                })}
              </div>
              <textarea className={inputCls} rows={3} maxLength={1000} value={text} onChange={function(e) { setText(e.target.value); }}
                placeholder="Chuyện gì xảy ra với lời đã nói? VD: Tôi đã nói đăng 15 video trước 18h, đến nay mới được 9, không kịp hạn." />
              <button className={btnPrimaryCls} disabled={props.busy || text.trim().length < 20}
                onClick={function() { send('restore1', { message: text, toIds: mustTell.concat(extra) }, 'Đã loan tin (bước 1/3)'); }}>Loan tin</button>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className={labelCls}>Tác động của việc không giữ được lời: tới ai, tới việc gì? (nên hỏi trực tiếp người liên quan)</label>
                <textarea className={inputCls} rows={3} maxLength={1500} value={impact} onChange={function(e) { setImpact(e.target.value); }} />
              </div>
              <div>
                <label className={labelCls}>Tôi khắc phục thế nào?</label>
                <textarea className={inputCls} rows={3} maxLength={1500} value={fix} onChange={function(e) { setFix(e.target.value); }} />
              </div>
              <button className={btnPrimaryCls} disabled={props.busy || impact.trim().length < 20 || fix.trim().length < 20}
                onClick={function() { send('restore2', { impact: impact, fix: fix }, 'Đã ghi bước 2/3'); }}>Lưu bước 2</button>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex gap-2">
                <button type="button" className={withNew ? btnPrimaryCls : btnCls} onClick={function() { setWithNew(true); }}>Có lời nói mới</button>
                <button type="button" className={!withNew ? btnPrimaryCls : btnCls} onClick={function() { setWithNew(false); }}>Không có lời mới</button>
              </div>
              {withNew ? (
                <CommitForm users={users} ownerId={me} nowIso={props.nowIso} busy={props.busy} submitLabel="Ghi lời mới và hoàn tất"
                  initial={{ title: c.title, target: c.target, unit: c.unit, criteria: c.criteria, why: c.why, verifierId: c.verifierId, relatedIds: c.relatedIds }}
                  onSubmit={function(i) { send('restore3', { newCommit: i, note: '' }, 'Đã hoàn tất 3 bước khôi phục'); }}
                  onCancel={function() { setPanel(''); }} />
              ) : (
                <>
                  <textarea className={inputCls} rows={2} maxLength={600} value={text} onChange={function(e) { setText(e.target.value); }} placeholder="Vì sao không có lời mới? VD: việc này không còn cần làm vì..." />
                  <button className={btnPrimaryCls} disabled={props.busy || text.trim().length < 10} onClick={function() { send('restore3', { note: text }, 'Đã hoàn tất 3 bước khôi phục'); }}>Hoàn tất</button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
