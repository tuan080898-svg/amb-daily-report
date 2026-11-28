'use client';

import { useState } from 'react';
import { igCheckSmart, igDay, type IgInput, type IgUser } from '@/lib/integrity';
import { btnCls, btnPrimaryCls, inputCls, labelCls } from './ui';

// Form ghi một lời cam kết theo SMART. Chỉ gửi được khi qua hết các điều kiện (máy chủ kiểm tra lại lần nữa).
export default function CommitForm(props: {
  users: IgUser[];
  ownerId: string;
  nowIso: string;
  busy: boolean;
  initial?: Partial<IgInput>;
  submitLabel: string;
  onSubmit: (i: IgInput) => void;
  onCancel: () => void;
}) {
  var init = props.initial || {};
  var [f, setF] = useState({
    title: init.title || '', target: init.target ? String(init.target) : '', unit: init.unit || '', criteria: init.criteria || '', why: init.why || '',
    verifierId: init.verifierId || '', relatedIds: init.relatedIds || ([] as string[]), dueDate: init.dueDate || igDay(props.nowIso), dueTime: init.dueTime || '18:00',
  });
  var [errors, setErrors] = useState<string[]>([]);
  var others = props.users.filter(function(u) { return u.id !== props.ownerId; });
  var set = function(k: string, v: unknown) { setF(Object.assign({}, f, { [k]: v })); };

  function submit() {
    var input: IgInput = Object.assign({}, f, { target: Number(f.target.replace(',', '.')) });
    var err = igCheckSmart(input, props.ownerId, Date.now());
    setErrors(err);
    if (!err.length) props.onSubmit(input);
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>S · Tôi cam kết sẽ làm gì? (cụ thể, rõ ràng)</label>
        <textarea className={inputCls} rows={2} maxLength={300} value={f.title} onChange={function(e) { set('title', e.target.value); }}
          placeholder="VD: Đăng 15 video bán gel tẩy mốc AMB lên TikTok Shop" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>M · Chỉ tiêu (số)</label>
          <input className={inputCls} inputMode="decimal" value={f.target} onChange={function(e) { set('target', e.target.value); }} placeholder="15" />
        </div>
        <div>
          <label className={labelCls}>M · Đơn vị đo</label>
          <input className={inputCls} maxLength={40} value={f.unit} onChange={function(e) { set('unit', e.target.value); }} placeholder="video" />
        </div>
        <div>
          <label className={labelCls}>T · Ngày hoàn thành</label>
          <input type="date" className={inputCls} min={igDay(props.nowIso)} value={f.dueDate} onChange={function(e) { set('dueDate', e.target.value); }} />
        </div>
        <div>
          <label className={labelCls}>T · Giờ</label>
          <input type="time" className={inputCls} value={f.dueTime} onChange={function(e) { set('dueTime', e.target.value); }} />
        </div>
      </div>
      <div>
        <label className={labelCls}>A, R · Vì sao lời này quan trọng? (mục tiêu nào, ai bị ảnh hưởng nếu không làm được)</label>
        <textarea className={inputCls} rows={2} maxLength={600} value={f.why} onChange={function(e) { set('why', e.target.value); }}
          placeholder="VD: Đủ video thì chiến dịch ra mắt có traffic, vận hành mới nhập hàng đúng kế hoạch" />
      </div>
      <div>
        <label className={labelCls}>Liên quan tới ai? (chọn ít nhất 1 người)</label>
        <div className="flex flex-wrap gap-2">
          {others.map(function(u) {
            var on = f.relatedIds.indexOf(u.id) >= 0;
            return (
              <button key={u.id} type="button" aria-pressed={on}
                onClick={function() { set('relatedIds', on ? f.relatedIds.filter(function(x) { return x !== u.id; }) : f.relatedIds.concat([u.id])); }}
                className={'px-3 py-1.5 rounded-full text-sm border ' + (on ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-600 text-gray-300')}>
                {on ? '✓ ' : ''}{u.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label className={labelCls}>Tiêu chí nghiệm thu (nhìn vào đâu để biết đã xong?)</label>
          <textarea className={inputCls} rows={2} maxLength={600} value={f.criteria} onChange={function(e) { set('criteria', e.target.value); }}
            placeholder="VD: Danh sách 15 link video đã đăng công khai trên kênh" />
        </div>
        <div>
          <label className={labelCls}>Người nghiệm thu</label>
          <select className={inputCls} value={f.verifierId} onChange={function(e) { set('verifierId', e.target.value); }}>
            <option value="">— Chọn —</option>
            {others.map(function(u) { return <option key={u.id} value={u.id}>{u.name}</option>; })}
          </select>
        </div>
      </div>
      {errors.length > 0 && (
        <ul className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 text-sm text-red-300 space-y-1" role="alert">
          {errors.map(function(e) { return <li key={e}>• {e}</li>; })}
        </ul>
      )}
      <p className="text-xs text-gray-500">Lời đã ghi thì không sửa, không xóa (chỉ rút lại được trong 15 phút đầu). Nếu thấy nguy cơ không làm được, hãy dùng 3 bước khôi phục.</p>
      <div className="flex gap-2">
        <button className={btnPrimaryCls} disabled={props.busy} onClick={submit}>{props.submitLabel}</button>
        <button className={btnCls} disabled={props.busy} onClick={props.onCancel}>Đóng</button>
      </div>
    </div>
  );
}
