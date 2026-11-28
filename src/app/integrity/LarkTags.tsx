'use client';

import { useState } from 'react';
import type { IgUser } from '@/lib/integrity';
import { btnCls, btnPrimaryCls, inputCls, type Act } from './ui';

// Admin khai mã Lark của từng thành viên để tin trong nhóm gắn thẻ @tên đúng người.
export default function LarkTags(props: { users: IgUser[]; saved: Record<string, string>; larkReady: boolean; busy: boolean; act: Act }) {
  var [draft, setDraft] = useState<Record<string, string>>(props.saved);
  var val = function(m: Record<string, string>, id: string) { return (m[id] || '').trim(); };
  var dirty = props.users.some(function(u) { return val(draft, u.id) !== val(props.saved, u.id); });
  var count = props.users.filter(function(u) { return !!props.saved[u.id]; }).length;

  return (
    <div className="mt-4 pt-4 border-t border-slate-700/60">
      <p className="text-sm font-medium text-gray-200">Gắn thẻ @tên trong tin Lark <span className="text-gray-500 font-normal">· {count}/{props.users.length} người đã có mã</span></p>
      <p className="text-xs text-gray-500 mt-1">
        Dán User ID (hoặc Open ID dạng ou_...) của từng người: Lark Admin → Organization → Members → bấm vào người đó. Bấm Lưu rồi bấm Thử: trong nhóm tên hiện màu xanh là đúng, chữ thường là sai mã. Người chưa có mã vẫn được ghi tên.
      </p>
      <ul className="mt-3 space-y-2">
        {props.users.map(function(u) {
          var unsaved = val(draft, u.id) !== val(props.saved, u.id);
          return (
            <li key={u.id} className="flex items-center gap-2">
              <label htmlFor={'lark-' + u.id} className="w-24 md:w-40 shrink-0 truncate text-sm text-gray-300">{u.name}</label>
              <input id={'lark-' + u.id} className={inputCls + ' min-w-0'} maxLength={64} autoComplete="off" spellCheck={false} value={draft[u.id] || ''} placeholder="Chưa có mã"
                onChange={function(e) { setDraft(Object.assign({}, draft, { [u.id]: e.target.value })); }} />
              <button type="button" className={btnCls} disabled={props.busy || !props.larkReady || unsaved || !props.saved[u.id]}
                onClick={function() { props.act('testTag', { userId: u.id }, 'Đã gửi tin thử, mở nhóm Lark để xem'); }}>Thử</button>
            </li>
          );
        })}
      </ul>
      <button type="button" className={btnPrimaryCls + ' mt-3'} disabled={props.busy || !dirty}
        onClick={function() { props.act('setLarkIds', { ids: draft }, 'Đã lưu mã Lark'); }}>Lưu mã Lark</button>
    </div>
  );
}
