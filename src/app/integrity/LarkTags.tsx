'use client';

import { useState } from 'react';
import type { IgUser } from '@/lib/integrity';
import { btnCls, btnPrimaryCls, inputCls, type Act } from './ui';

// Admin liên kết từng thành viên với tài khoản Lark: để gắn thẻ @tên trong nhóm và nhắn thẻ riêng bấm được.
export default function LarkTags(props: { users: IgUser[]; saved: Record<string, string>; larkReady: boolean; larkApp: boolean; busy: boolean; act: Act }) {
  var [draft, setDraft] = useState<Record<string, string>>(props.saved);
  var val = function(m: Record<string, string>, id: string) { return (m[id] || '').trim(); };
  var dirty = props.users.some(function(u) { return val(draft, u.id) !== val(props.saved, u.id); });
  var count = props.users.filter(function(u) { return !!props.saved[u.id]; }).length;

  return (
    <div className="mt-4 pt-4 border-t border-slate-700/60">
      <p className="text-sm font-medium text-gray-200">Liên kết tài khoản Lark <span className="text-gray-500 font-normal">· {count}/{props.users.length} người đã liên kết</span></p>
      <p className="text-xs text-gray-500 mt-1">
        Nhập email hoặc số điện thoại người đó dùng đăng nhập Lark rồi bấm Lưu, app tự đổi thành mã (cũng dán được mã Lark có sẵn).
        Bấm <b>Tag</b> để thử gắn tên trong nhóm, <b>Thẻ</b> để thử nhắn thẻ riêng. Thẻ trong Lark: <b>{props.larkApp ? 'đã bật' : 'chưa bật (cần đặt LARK_VERIFY_TOKEN trên Vercel)'}</b>.
      </p>
      <ul className="mt-3 space-y-3">
        {props.users.map(function(u) {
          var unsaved = val(draft, u.id) !== val(props.saved, u.id);
          var off = props.busy || unsaved || !props.saved[u.id];
          return (
            <li key={u.id} className="space-y-1">
              <label htmlFor={'lark-' + u.id} className="block truncate text-sm text-gray-300">{u.name}</label>
              <div className="flex items-center gap-2">
                <input id={'lark-' + u.id} className={inputCls + ' min-w-0'} maxLength={120} autoComplete="off" spellCheck={false} value={draft[u.id] || ''} placeholder="Email, số điện thoại hoặc mã Lark"
                  onChange={function(e) { setDraft(Object.assign({}, draft, { [u.id]: e.target.value })); }} />
                <button type="button" className={btnCls} disabled={off || !props.larkReady}
                  onClick={function() { props.act('testTag', { userId: u.id }, 'Đã gửi tin thử, mở nhóm Lark để xem'); }}>Tag</button>
                <button type="button" className={btnCls} disabled={off || !props.larkApp}
                  onClick={function() { props.act('testCard', { userId: u.id }, 'Đã nhắn thẻ thử, người đó mở Lark và bấm nút trên thẻ'); }}>Thẻ</button>
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" className={btnPrimaryCls + ' mt-3'} disabled={props.busy || !dirty}
        onClick={function() { props.act('setLarkIds', { ids: draft }, 'Đã lưu liên kết Lark'); }}>Lưu liên kết</button>
    </div>
  );
}
