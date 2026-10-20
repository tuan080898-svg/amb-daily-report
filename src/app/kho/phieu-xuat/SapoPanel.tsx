'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { getSkuProducts } from '@/lib/sku';
import type { PxkBatch } from '@/lib/pxk';
import { parseSapoPayload, isSapoOrigin, buildSapoBookmarklet, SAPO_SOURCE_COLORS, type SapoOrder } from '@/lib/pxk-sapo';

function fmtVn(iso: string): string {
  var t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  return t.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
}

const WH_LABEL: Record<string, string> = { HN: 'Hà Nội', HCM: 'HCM', '': 'Chưa rõ kho' };
const whCount = function(w: string, n: number) { return (w ? 'Kho ' : '') + WH_LABEL[w] + ': ' + n + ' đơn'; };

export default function SapoPanel(props: { batches: PxkBatch[]; busy: boolean; disabled: boolean; onCreate: (orders: SapoOrder[]) => void }) {
  const [orders, setOrders] = useState<SapoOrder[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const batchesRef = useRef<PxkBatch[]>(props.batches);
  useEffect(function() { batchesRef.current = props.batches; });

  // Đơn Sapo đã có trong phiếu: mã đơn -> mã phiếu
  const done = useMemo(function() {
    var m: Record<string, string> = {};
    props.batches.forEach(function(b) { if (b.platform === 'sapo') b.orders.forEach(function(o) { m[o.orderId] = b.id; }); });
    return m;
  }, [props.batches]);

  useEffect(function() {
    // React chặn href "javascript:", nên gán trực tiếp vào thẻ a
    if (linkRef.current) linkRef.current.setAttribute('href', buildSapoBookmarklet(window.location.origin));

    function onMessage(e: MessageEvent) {
      if (!isSapoOrigin(e.origin)) return;
      var d = e.data as { type?: string; payload?: unknown } | null;
      if (!d || d.type !== 'amb-sapo-orders') return;
      var res = parseSapoPayload(d.payload);
      var doneNow: Record<string, string> = {};
      batchesRef.current.forEach(function(b) { if (b.platform === 'sapo') b.orders.forEach(function(o) { doneNow[o.orderId] = b.id; }); });
      setOrders(res.orders);
      var s: Record<string, boolean> = {};
      res.orders.forEach(function(o) { s[o.code] = !doneNow[o.code]; });
      setSel(s);
      setMsg('Đã nhận ' + res.orders.length + ' đơn từ Sapo lúc ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }) + (res.skipped > 0 ? ' (bỏ ' + res.skipped + ' đơn lỗi)' : '') + '.');
    }
    window.addEventListener('message', onMessage);
    // Mở từ nút trong Sapo: báo cho trang Sapo biết app đã sẵn sàng nhận dữ liệu
    if (window.opener && window.location.hash === '#sapo') {
      try { window.opener.postMessage({ type: 'amb-ready' }, '*'); } catch { /* không có cửa sổ gốc */ }
      setTimeout(function() { setMsg(function(m) { return m || 'Đang chờ dữ liệu từ trang Sapo...'; }); }, 0);
    }
    return function() { window.removeEventListener('message', onMessage); };
  }, []);

  const chosen = orders.filter(function(o) { return sel[o.code] && !done[o.code]; });
  const fresh = orders.filter(function(o) { return !done[o.code]; });
  const byWh = useMemo(function() {
    var m: Record<string, number> = {};
    chosen.forEach(function(o) { m[o.wh] = (m[o.wh] || 0) + 1; });
    return m;
  }, [chosen]);
  const sources = useMemo(function() {
    var m: Record<string, number> = {};
    fresh.forEach(function(o) { m[o.source] = (m[o.source] || 0) + 1; });
    return m;
  }, [fresh]);

  function setSource(src: string, on: boolean) {
    setSel(function(prev) {
      var n = Object.assign({}, prev);
      orders.forEach(function(o) { if (o.source === src && !done[o.code]) n[o.code] = on; });
      return n;
    });
  }

  function copyCode() {
    navigator.clipboard.writeText(buildSapoBookmarklet(window.location.origin)).then(function() { setCopied(true); setTimeout(function() { setCopied(false); }, 3000); }).catch(function() { /* tự kéo thả nút */ });
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[260px]">
          <div className="text-sm font-semibold text-gray-200">Đơn lên bằng Sapo (CSKH gửi tặng / gửi bù, khách sỉ, KOL KOC...)</div>
          <div className="text-xs text-gray-500 mt-0.5">Đơn do CSKH lên tay trên Sapo không có file PDF nhãn. Bấm nút ⭐ trong Sapo để kéo các đơn đó sang đây rồi lập phiếu theo từng kho.</div>
        </div>
      </div>

      <details className="mt-3 text-sm" open={orders.length === 0}>
        <summary className="cursor-pointer text-gray-400">Cách dùng (cài một lần, dùng hằng ngày)</summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1.5 text-gray-400 text-xs">
          <li>Bật thanh Yêu thích của trình duyệt (Edge/Chrome: bấm <b>Ctrl + Shift + B</b>).</li>
          <li>Kéo nút này lên thanh Yêu thích (chỉ làm một lần):{' '}
            <a ref={linkRef} onClick={function(e) { e.preventDefault(); }} draggable
              className="inline-block px-3 py-1 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-200 font-semibold cursor-grab no-underline">⭐ Lấy đơn Sapo</a>
            {' '}<button onClick={copyCode} className="ml-1 px-2 py-1 rounded border border-slate-600 text-gray-300 hover:bg-slate-800">{copied ? 'Đã sao chép' : 'hoặc sao chép mã'}</button>
            <span className="text-gray-500"> (nếu không kéo được: thêm Yêu thích mới, dán mã vào ô địa chỉ)</span>
          </li>
          <li>Mở Sapo (đã đăng nhập), bấm <b>⭐ Lấy đơn Sapo</b> trên thanh Yêu thích. App mở lại ở cửa sổ này và hiện các đơn tay trong 3 ngày gần nhất.</li>
          <li>Chọn đơn cần xuất rồi bấm lập phiếu. Đơn đã lập phiếu rồi tự bỏ chọn, không bị tính hai lần.</li>
        </ol>
        <div className="text-xs text-gray-500 mt-2">Nút chỉ đọc đơn trên Sapo, không sửa gì trên Sapo, không dùng mật khẩu hay khóa nào.</div>
      </details>

      {msg && <div className="mt-3 text-sm text-emerald-300">{msg}</div>}

      {orders.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span>Chọn theo nguồn:</span>
            {Object.keys(sources).sort().map(function(src) {
              var all = fresh.filter(function(o) { return o.source === src; });
              var on = all.every(function(o) { return sel[o.code]; });
              return (
                <label key={src} className={'inline-flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer ' + (SAPO_SOURCE_COLORS[src] || 'bg-slate-700/60 text-gray-300')}>
                  <input type="checkbox" checked={on} onChange={function(e) { setSource(src, e.target.checked); }} /> {src} ({sources[src]})
                </label>
              );
            })}
          </div>
          <div className="mt-3 overflow-x-auto max-h-[420px] overflow-y-auto border border-slate-800 rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900"><tr className="text-xs text-gray-400 border-b border-slate-700">
                <th className="px-2 py-2 w-8"></th><th className="px-2 py-2 text-left">Mã đơn</th><th className="px-2 py-2 text-left">Lúc</th><th className="px-2 py-2 text-left">Nguồn</th>
                <th className="px-2 py-2 text-left">Kho</th><th className="px-2 py-2 text-left">Khách / ghi chú</th><th className="px-2 py-2 text-left">Sản phẩm × SL</th>
              </tr></thead>
              <tbody>
                {orders.map(function(o) {
                  var d = done[o.code];
                  return (
                    <tr key={o.code} className={'border-b border-slate-800 align-top ' + (d ? 'opacity-50' : '')}>
                      <td className="px-2 py-2"><input type="checkbox" disabled={!!d} checked={!!sel[o.code] && !d} onChange={function(e) { var v = e.target.checked; setSel(function(p) { var n = Object.assign({}, p); n[o.code] = v; return n; }); }} /></td>
                      <td className="px-2 py-2 font-mono text-gray-200 whitespace-nowrap">{o.code}{d && <div className="text-[11px] text-amber-300 font-sans">đã có ở phiếu {d}</div>}</td>
                      <td className="px-2 py-2 text-gray-400 whitespace-nowrap">{fmtVn(o.createdAt)}</td>
                      <td className="px-2 py-2"><span className={'inline-flex px-2 py-0.5 rounded text-xs ' + (SAPO_SOURCE_COLORS[o.source] || 'bg-slate-700/60 text-gray-300')}>{o.source}</span></td>
                      <td className={'px-2 py-2 whitespace-nowrap ' + (o.wh ? 'text-gray-300' : 'text-amber-300')}>{WH_LABEL[o.wh]}</td>
                      <td className="px-2 py-2 text-gray-400 max-w-[220px] break-words">{o.cust}{o.note ? ' · ' + o.note : ''}</td>
                      <td className="px-2 py-2 text-gray-300">
                        {o.items.map(function(it, i) {
                          var known = !!it.sku && getSkuProducts(it.sku).length > 0;
                          return <div key={i} className={known ? '' : 'text-amber-300'} title={it.name}>{it.sku || '(chưa có SKU)'} × <b>{it.qty}</b>{!known && it.sku ? ' (SKU chưa có trong bảng quy đổi)' : ''}</div>;
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={function() { props.onCreate(chosen); }} disabled={props.busy || props.disabled || chosen.length === 0}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">
              {props.busy ? 'Đang xử lý...' : '🖨 Lập và in phiếu cho ' + chosen.length + ' đơn Sapo'}
            </button>
            <span className="text-xs text-gray-400">
              {Object.keys(byWh).sort().map(function(w) { return whCount(w, byWh[w]); }).join(' · ') || 'Chưa chọn đơn nào'}
              {chosen.length > 0 && ' · mỗi kho một phiếu'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
