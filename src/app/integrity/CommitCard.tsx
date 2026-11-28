'use client';

import { useState } from 'react';
import { IG_CANCEL_MINUTES, IG_STATE_LABEL, igDueText, igFmt, igLastReport, igState, type IgCommit, type IgUser } from '@/lib/integrity';
import { BADGE, STRIPE, btnDangerCls, btnLinkCls, btnPrimaryCls, nameOf, type Act, type DialogKind } from './ui';

// Một thẻ = một lời hứa: nội dung, hạn, và đúng MỘT nút việc cần làm. Phần còn lại nằm trong "Chi tiết".
export default function CommitCard(props: { c: IgCommit; users: IgUser[]; meId: string; isAdmin: boolean; nowIso: string; busy: boolean; act: Act; open: (kind: DialogKind, id: string) => void }) {
  var c = props.c, users = props.users, me = props.meId;
  var nowMs = Date.parse(props.nowIso);
  var state = igState(c, nowMs);
  var mine = c.ownerId === me;
  var report = igLastReport(c);
  var waiting = !!report && !report.verdict;
  var live = state === 'open' || state === 'pending' || state === 'overdue' || state === 'restoring';
  var accepted = !!report && !!report.verdict && report.verdict.ok;
  var rejected = !!report && !!report.verdict && !report.verdict.ok;
  var canReport = mine && live && !waiting && !accepted;
  var canRestore = mine && live && !c.restore.step3;
  var mustRestore = canRestore && (state === 'overdue' || state === 'restoring');
  var canVerify = waiting && !mine && !c.voided && (c.verifierId === me || props.isAdmin);
  var needAck = !c.voided && !!c.restore.step1 && c.restore.step1.toIds.indexOf(me) >= 0 && !c.acks.some(function(a) { return a.userId === me; });
  var canCancel = mine && !c.voided && !c.fromId && !c.reports.length && !c.restore.step1 && nowMs - Date.parse(c.createdAt) <= IG_CANCEL_MINUTES * 60000;
  var step = !c.restore.step1 ? 1 : !c.restore.step2 ? 2 : 3;
  var due = igDueText(c.due, nowMs);
  var [more, setMore] = useState(false);
  var go = function(k: DialogKind) { props.open(k, c.id); };

  return (
    <article className={'bg-slate-900 border border-slate-700 border-l-4 rounded-xl p-4 ' + STRIPE[state]}>
      {/* Điện thoại: nhãn trạng thái nằm trên để tiêu đề được rộng hết thẻ */}
      <div className="flex flex-col-reverse items-start gap-1.5 md:flex-row md:justify-between md:gap-3">
        <p className={'text-[15px] font-semibold break-words min-w-0 ' + (c.voided ? 'text-gray-500 line-through' : 'text-gray-100')}>{c.title}</p>
        <span className={'shrink-0 px-2 py-0.5 rounded-md text-xs font-medium ' + BADGE[state]}>{IG_STATE_LABEL[state]}</span>
      </div>
      <p className="text-sm text-gray-400 mt-1">
        {!mine && <><b className="text-gray-200">{nameOf(users, c.ownerId)}</b> · </>}
        {due.when}{live && <span className={due.late ? 'text-red-300 font-medium' : 'text-blue-300'}> ({due.left})</span>} · {c.target} {c.unit}
      </p>
      {rejected && live && <p className="text-sm text-red-300 mt-1 break-words">Chưa đạt: {report!.verdict!.note}</p>}
      {state === 'pending' && !canVerify && <p className="text-sm text-violet-300 mt-1">Đang chờ {nameOf(users, c.verifierId)} nghiệm thu</p>}
      {needAck && <p className="text-sm text-orange-300 mt-1 break-words">{nameOf(users, c.ownerId)} báo: {c.restore.step1!.message}</p>}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
        {mustRestore && <button className={btnDangerCls} disabled={props.busy} onClick={function() { go('restore'); }}>{step === 1 ? 'Khôi phục (3 bước)' : 'Làm tiếp bước ' + step + '/3'}</button>}
        {canReport && !mustRestore && <button className={btnPrimaryCls} disabled={props.busy} onClick={function() { go('report'); }}>✓ Báo đã xong</button>}
        {canVerify && <button className={c.verifierId === me ? btnPrimaryCls : btnLinkCls} disabled={props.busy} onClick={function() { go('verify'); }}>Nghiệm thu</button>}
        {needAck && <button className={btnPrimaryCls} disabled={props.busy} onClick={function() { props.act('ack', { ownerId: c.ownerId, id: c.id }, 'Đã xác nhận nhận tin'); }}>Tôi đã nhận tin</button>}
        {canReport && mustRestore && <button className={btnLinkCls} disabled={props.busy} onClick={function() { go('report'); }}>Đã làm xong</button>}
        {canRestore && state === 'open' && <button className={btnLinkCls + ' !text-orange-300'} disabled={props.busy} onClick={function() { go('restore'); }}>Không kịp?</button>}
        <button type="button" className={btnLinkCls + ' ml-auto'} aria-expanded={more} onClick={function() { setMore(!more); }}>{more ? 'Thu gọn ▲' : 'Chi tiết ▼'}</button>
      </div>

      {more && (
        <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-3 text-sm text-gray-300 break-words">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-gray-500">Người hứa</dt><dd>{nameOf(users, c.ownerId)}</dd>
            <dt className="text-gray-500">Liên quan</dt><dd>{c.relatedIds.map(function(id) { return nameOf(users, id); }).join(', ')}</dd>
            <dt className="text-gray-500">Nghiệm thu</dt><dd>{nameOf(users, c.verifierId)}</dd>
            <dt className="text-gray-500">Xong khi</dt><dd>{c.criteria}</dd>
            <dt className="text-gray-500">Vì sao</dt><dd>{c.why}</dd>
            <dt className="text-gray-500">Hạn</dt><dd>{igFmt(c.due)}</dd>
            <dt className="text-gray-500">Ghi lúc</dt><dd>{igFmt(c.createdAt)}{c.fromId ? ' (hứa lại sau khi khôi phục)' : ''}</dd>
          </dl>
          {c.voided && <p className="text-gray-400">Đã hủy bởi {nameOf(users, c.voided.by)} lúc {igFmt(c.voided.at)}: {c.voided.reason}</p>}
          {c.reports.map(function(r) {
            return (
              <div key={r.at} className="bg-slate-800/60 rounded-lg p-3">
                <p>Báo xong {igFmt(r.at)}{Date.parse(r.at) > Date.parse(c.due) ? ' (trễ hạn)' : ''}: <b>{r.actual} / {c.target} {c.unit}</b></p>
                <p className="whitespace-pre-wrap">{r.evidence}</p>
                {r.verdict && <p className={r.verdict.ok ? 'text-green-300' : 'text-red-300'}>{r.verdict.ok ? 'Đạt' : 'Chưa đạt'} — {nameOf(users, r.verdict.by)}, {igFmt(r.verdict.at)}{r.verdict.note ? ': ' + r.verdict.note : ''}</p>}
              </div>
            );
          })}
          {c.restore.step1 && (
            <div className="bg-slate-800/60 rounded-lg p-3 space-y-2">
              <p className="font-semibold text-orange-300">Khôi phục Integrity</p>
              <div>
                <p><b>1. Báo cho mọi người</b> ({igFmt(c.restore.step1.at)}{c.restore.step1.larkSent ? ', đã gửi Lark' : ', chưa gửi Lark'}): {c.restore.step1.message}</p>
                <p className="text-xs text-gray-400">{c.restore.step1.toIds.map(function(id) { return nameOf(users, id) + (c.acks.some(function(a) { return a.userId === id; }) ? ' ✓ đã nhận' : ' (chưa xác nhận)'); }).join(' · ')}</p>
              </div>
              {c.restore.step2 && <p><b>2. Tác động</b> ({igFmt(c.restore.step2.at)}): {c.restore.step2.impact}<br /><b>Khắc phục:</b> {c.restore.step2.fix}</p>}
              {c.restore.step3 && <p><b>3. Lời hứa mới</b> ({igFmt(c.restore.step3.at)}): {c.restore.step3.newId ? 'đã hứa lại' : 'không hứa lại'}{c.restore.step3.note ? ' — ' + c.restore.step3.note : ''}</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {canRestore && state === 'pending' && <button className={btnLinkCls} disabled={props.busy} onClick={function() { go('restore'); }}>Khôi phục Integrity</button>}
            {canCancel && <button className={btnLinkCls} disabled={props.busy} onClick={function() { if (window.confirm('Rút lại lời vừa ghi?')) props.act('cancel', { ownerId: c.ownerId, id: c.id }, 'Đã rút lại'); }}>Rút lại (trong 15 phút đầu)</button>}
            {props.isAdmin && !c.voided && <button className={btnLinkCls} disabled={props.busy} onClick={function() { go('void'); }}>Hủy lời ghi nhầm (admin)</button>}
          </div>
        </div>
      )}
    </article>
  );
}
