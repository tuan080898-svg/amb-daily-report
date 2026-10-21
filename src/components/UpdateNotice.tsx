'use client';

import { useEffect, useRef, useState } from 'react';

// Trang để mở nhiều ngày vẫn chạy bản cũ của app (vd ngày in phiếu mặc định bị kẹt ở hôm qua).
// Component này hỏi máy chủ mã bản đang chạy; thấy khác lúc mở trang thì hiện thanh nhắc tải lại.
export default function UpdateNotice() {
  const [stale, setStale] = useState(false);
  const first = useRef<string | null>(null);

  useEffect(function() {
    var alive = true;
    function check() {
      fetch('/api/version', { cache: 'no-store' })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(j) {
          if (!alive || !j || typeof j.v !== 'string') return;
          if (first.current === null) first.current = j.v;
          else if (j.v !== first.current && j.v !== 'dev') setStale(true);
        })
        .catch(function() { /* mất mạng: bỏ qua, lần sau kiểm tra lại */ });
    }
    check();
    var timer = setInterval(check, 5 * 60 * 1000);
    function onVisible() { if (document.visibilityState === 'visible') check(); }
    document.addEventListener('visibilitychange', onVisible);
    return function() { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  if (!stale) return null;
  return (
    <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] bg-amber-600 text-white text-sm rounded-xl shadow-xl px-4 py-3 flex flex-wrap items-center gap-3">
      <span>App vừa có bản cập nhật mới. Hãy tải lại trang để dùng bản mới (nếu đang chọn file dở, lập phiếu xong rồi hãy tải lại).</span>
      <button onClick={function() { window.location.reload(); }} className="px-3 py-1.5 rounded-lg bg-white text-amber-700 font-semibold">Tải lại ngay</button>
    </div>
  );
}
