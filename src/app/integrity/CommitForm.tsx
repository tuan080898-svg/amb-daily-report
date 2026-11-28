'use client';

import { useState } from 'react';
import { igAddDays, igDay, igDueIso, igDueText, igSmartErrors, type IgInput, type IgStep, type IgUser } from '@/lib/integrity';
import { btnCls, btnPrimaryCls, chipCls, hintCls, inputCls, labelCls, nameOf } from './ui';

var STEPS: Array<[IgStep, string]> = [[1, 'Việc gì'], [2, 'Khi nào'], [3, 'Liên quan ai']];
var UNITS = ['việc', 'video', 'đơn', 'báo cáo', 'sản phẩm', '%'];
var TIMES = ['12:00', '18:00', '21:00'];

// Ghi một lời cam kết theo 3 bước ngắn, mỗi bước một câu hỏi. Máy chủ kiểm tra lại toàn bộ.
export default function CommitForm(props: {
  users: IgUser[];
  ownerId: string;
  nowIso: string;
  busy: boolean;
  initial?: Partial<IgInput>;
  quick?: boolean; // hứa lại: nội dung giữ nguyên, chỉ cần chọn hạn mới
  submitLabel: string;
  onSubmit: (i: IgInput) => void;
}) {
  var init = props.initial || {};
  var nowMs = Date.parse(props.nowIso);
  var today = igDay(props.nowIso);
  // Mặc định 18:00 hôm nay; quá giờ đó rồi thì 18:00 ngày mai
  var defaultDate = Date.parse(igDueIso(today, '18:00')) > nowMs ? today : igAddDays(today, 1);
  var [f, setF] = useState({
    title: init.title || '', target: init.target ? String(init.target) : '1', unit: init.unit || 'việc', criteria: init.criteria || '', why: init.why || '',
    verifierId: init.verifierId || '', relatedIds: init.relatedIds || ([] as string[]), dueDate: init.dueDate || defaultDate, dueTime: init.dueTime || '18:00',
  });
  var [step, setStep] = useState<IgStep>(props.quick ? 2 : 1);
  var [full, setFull] = useState(!props.quick);
  var [errors, setErrors] = useState<string[]>([]);
  var others = props.users.filter(function(u) { return u.id !== props.ownerId; });
  var set = function(patch: Partial<typeof f>) { setF(Object.assign({}, f, patch)); setErrors([]); };
  var input: IgInput = Object.assign({}, f, { target: Number(f.target.replace(',', '.')) });
  var dueIso = igDueIso(f.dueDate, f.dueTime);

  var friday = igAddDays(today, (5 - new Date(today + 'T00:00:00Z').getUTCDay() + 7) % 7);
  var monthEnd = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  var dates: Array<[string, string]> = [['Hôm nay', today], ['Ngày mai', igAddDays(today, 1)], ['Thứ Sáu', friday], ['Cuối tháng', monthEnd]];

  // Chỉ sang bước sau khi bước hiện tại đủ; bấm gửi thì kiểm tra tất cả
  function go(to: IgStep) {
    var err = igSmartErrors(input, props.ownerId, Date.now()).filter(function(e) { return e.step < to; });
    if (err.length) { setStep(err[0].step); setErrors(err.filter(function(e) { return e.step === err[0].step; }).map(function(e) { return e.msg; })); return; }
    setStep(to); setErrors([]);
  }
  function submit() {
    var err = igSmartErrors(input, props.ownerId, Date.now());
    if (err.length) { if (err[0].step !== 2) setFull(true); setStep(err[0].step); setErrors(err.filter(function(e) { return e.step === err[0].step; }).map(function(e) { return e.msg; })); return; }
    props.onSubmit(input);
  }

  return (
    <div className="space-y-4">
      {full && <div className="flex gap-1.5">
        {STEPS.map(function(s) {
          return (
            <button key={s[0]} type="button" aria-current={step === s[0] ? 'step' : undefined} onClick={function() { if (s[0] < step) { setStep(s[0]); setErrors([]); } else go(s[0]); }}
              className={'flex-1 text-center rounded-lg px-1 py-2 text-xs font-medium ' + (step === s[0] ? 'bg-blue-600 text-white' : s[0] < step ? 'bg-green-500/20 text-green-300' : 'bg-slate-800 text-gray-500')}>
              {s[0] < step ? '✓' : s[0]} {s[1]}
            </button>
          );
        })}
      </div>}

      {step === 1 && (
        <>
          <div>
            <label className={labelCls} htmlFor="ig-title">Tôi cam kết sẽ làm gì?</label>
            <textarea id="ig-title" className={inputCls} rows={2} maxLength={300} value={f.title} onChange={function(e) { set({ title: e.target.value }); }}
              placeholder="VD: Đăng video bán gel tẩy mốc AMB lên TikTok Shop" />
          </div>
          <div>
            <label className={labelCls} htmlFor="ig-target">Bao nhiêu là xong?</label>
            <div className="flex gap-2">
              <input id="ig-target" className={inputCls + ' !w-24'} inputMode="decimal" value={f.target} onChange={function(e) { set({ target: e.target.value }); }} />
              <input aria-label="Đơn vị đo" className={inputCls} maxLength={40} value={f.unit} onChange={function(e) { set({ unit: e.target.value }); }} placeholder="Đơn vị" />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {UNITS.map(function(u) { return <button key={u} type="button" aria-pressed={f.unit === u} className={chipCls(f.unit === u)} onClick={function() { set({ unit: u }); }}>{u}</button>; })}
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="ig-criteria">Nhìn vào đâu để biết đã xong?</label>
            <textarea id="ig-criteria" className={inputCls} rows={2} maxLength={600} value={f.criteria} onChange={function(e) { set({ criteria: e.target.value }); }}
              placeholder="VD: Danh sách link video đã đăng công khai trên kênh" />
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div>
            <span className={labelCls}>Xong vào ngày nào?</span>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {dates.map(function(d) { return <button key={d[0]} type="button" aria-pressed={f.dueDate === d[1]} className={chipCls(f.dueDate === d[1])} onClick={function() { set({ dueDate: d[1] }); }}>{d[0]}</button>; })}
            </div>
            <input aria-label="Ngày hoàn thành" type="date" className={inputCls} min={today} value={f.dueDate} onChange={function(e) { set({ dueDate: e.target.value }); }} />
          </div>
          <div>
            <span className={labelCls}>Trước mấy giờ?</span>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {TIMES.map(function(t) { return <button key={t} type="button" aria-pressed={f.dueTime === t} className={chipCls(f.dueTime === t)} onClick={function() { set({ dueTime: t }); }}>{t}</button>; })}
            </div>
            <input aria-label="Giờ hoàn thành" type="time" className={inputCls} value={f.dueTime} onChange={function(e) { set({ dueTime: e.target.value }); }} />
          </div>
          {dueIso && <p className="text-sm text-blue-300">Hạn: <b>{igDueText(dueIso, nowMs).when}</b> ({igDueText(dueIso, nowMs).left})</p>}
        </>
      )}

      {step === 3 && (
        <>
          <div>
            <span className={labelCls}>Ai bị ảnh hưởng nếu việc này không xong?</span>
            <div className="flex flex-wrap gap-1.5">
              {others.map(function(u) {
                var on = f.relatedIds.indexOf(u.id) >= 0;
                return <button key={u.id} type="button" aria-pressed={on} className={chipCls(on)}
                  onClick={function() { set({ relatedIds: on ? f.relatedIds.filter(function(x) { return x !== u.id; }) : f.relatedIds.concat([u.id]) }); }}>{on ? '✓ ' : ''}{u.name}</button>;
              })}
            </div>
            <p className={hintCls}>Chọn được nhiều người.</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="ig-verifier">Ai nghiệm thu?</label>
            <select id="ig-verifier" className={inputCls} value={f.verifierId} onChange={function(e) { set({ verifierId: e.target.value }); }}>
              <option value="">— Chọn một người —</option>
              {others.map(function(u) { return <option key={u.id} value={u.id}>{u.name}</option>; })}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="ig-why">Vì sao việc này quan trọng?</label>
            <textarea id="ig-why" className={inputCls} rows={2} maxLength={600} value={f.why} onChange={function(e) { set({ why: e.target.value }); }}
              placeholder="VD: Có đủ video thì chiến dịch ra mắt có khách, kho mới nhập hàng đúng kế hoạch" />
          </div>
          <div className="bg-blue-500/10 border border-blue-500/40 rounded-lg p-3 text-sm text-gray-200 break-words">
            <p className="text-xs text-blue-300 mb-1">Lời của {nameOf(props.users, props.ownerId)} · cả tổ chức xem được</p>
            <p><b>{f.title.trim()}</b> — {f.target} {f.unit}, xong trước <b>{dueIso ? igDueText(dueIso, nowMs).when : '?'}</b>.</p>
            <p className={hintCls}>Ghi rồi không sửa được (chỉ rút lại trong 15 phút đầu).</p>
          </div>
        </>
      )}

      {errors.length > 0 && (
        <ul className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 text-sm text-red-300 space-y-1" role="alert">
          {errors.map(function(e) { return <li key={e}>• {e}</li>; })}
        </ul>
      )}

      {!full && (
        <p className="text-sm text-gray-400 break-words">
          Giữ nguyên: <b className="text-gray-200">{f.title}</b> ({f.target} {f.unit}), nghiệm thu {nameOf(props.users, f.verifierId)}.{' '}
          <button type="button" className="text-blue-400 underline" onClick={function() { setFull(true); setStep(1); }}>Sửa nội dung</button>
        </p>
      )}

      <div className="flex gap-2">
        {full && step > 1 && <button type="button" className={btnCls} disabled={props.busy} onClick={function() { setStep((step - 1) as IgStep); setErrors([]); }}>← Quay lại</button>}
        {full && step < 3
          ? <button key="next" type="button" className={btnPrimaryCls + ' flex-1'} onClick={function() { go((step + 1) as IgStep); }}>Tiếp tục →</button>
          // Bấm đúp vào "Tiếp tục" không được gửi luôn lời cam kết
          : <button key="send" type="button" className={btnPrimaryCls + ' flex-1'} disabled={props.busy} onClick={function(e) { if (e.detail < 2) submit(); }}>{props.submitLabel}</button>}
      </div>
    </div>
  );
}
