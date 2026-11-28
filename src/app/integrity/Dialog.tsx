'use client';

import { useEffect } from 'react';

// Hộp thoại cho một việc duy nhất: điện thoại trượt từ dưới lên, máy tính hiện giữa màn hình.
// Bấm ra ngoài không đóng, để không mất chữ đang gõ.
export default function Dialog(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(function() {
    var old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return function() { document.body.style.overflow = old; };
  }, []);

  return (
    <div className="fixed inset-0 z-[65] bg-black/70 flex items-end md:items-center justify-center md:p-4" role="dialog" aria-modal="true" aria-label={props.title}>
      <div className="bg-slate-900 border border-slate-700 w-full md:max-w-xl max-h-[92dvh] flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-700">
          <h2 className="text-base font-bold text-gray-100">{props.title}</h2>
          <button type="button" aria-label="Đóng" onClick={props.onClose} className="w-9 h-9 rounded-lg text-gray-400 hover:bg-slate-800 hover:text-gray-100 text-lg">✕</button>
        </div>
        <div className="p-4 overflow-y-auto pb-6">{props.children}</div>
      </div>
    </div>
  );
}
