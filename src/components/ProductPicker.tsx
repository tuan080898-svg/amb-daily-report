'use client';

import { useMemo, useState } from 'react';

// Ô chọn sản phẩm có tìm kiếm: gõ không dấu, nhiều từ, hoặc mã SKU đều ra; bấm hoặc Enter để chọn.
// (Thay cho danh sách gợi ý mặc định của trình duyệt, vốn đòi gõ đúng dấu.)

function foldChar(c: string): string { return c === 'đ' || c === 'Đ' ? 'd' : c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
export function pickFold(s: string): string { var out = ''; for (var i = 0; i < s.length; i++) out += foldChar(s[i]).charAt(0) || ' '; return out; }
export function pickMatch(hay: string, q: string): boolean {
  var toks = pickFold(q).split(/\s+/).filter(Boolean);
  var h = pickFold(hay);
  return toks.every(function(t) { return h.indexOf(t) >= 0; });
}

function Hl(props: { text: string; q: string }) {
  var toks = pickFold(props.q).split(/\s+/).filter(Boolean);
  if (!toks.length) return <>{props.text}</>;
  var h = pickFold(props.text);
  var mark: boolean[] = [];
  for (var i = 0; i < props.text.length; i++) mark.push(false);
  toks.forEach(function(t) { var p = h.indexOf(t); while (p >= 0) { for (var k = p; k < p + t.length; k++) mark[k] = true; p = h.indexOf(t, p + t.length); } });
  var parts: React.ReactNode[] = [];
  var start = 0;
  for (var j = 1; j <= props.text.length; j++) {
    if (j === props.text.length || mark[j] !== mark[start]) {
      var seg = props.text.slice(start, j);
      parts.push(mark[start] ? <mark key={start} className="bg-yellow-400/30 text-yellow-100 rounded px-0.5">{seg}</mark> : <span key={start}>{seg}</span>);
      start = j;
    }
  }
  return <>{parts}</>;
}

export default function ProductPicker(props: { value: string; onChange: (v: string) => void; options: string[]; skuOf: Record<string, string[]>; placeholder: string; className?: string; emptyHint?: string }) {
  var [open, setOpen] = useState(false);
  var [hi, setHi] = useState(0);
  var q = props.value;
  var list = useMemo(function() {
    return q.trim() ? props.options.filter(function(p) { return pickMatch(p + ' ' + (props.skuOf[p] || []).join(' '), q); }) : props.options;
  }, [q, props.options, props.skuOf]);
  var shown = list.slice(0, 50);
  function pick(p: string) { props.onChange(p); setOpen(false); }
  return (
    <div className="relative">
      <input
        value={q}
        placeholder={props.placeholder}
        className={props.className}
        autoComplete="off"
        onFocus={function() { setOpen(true); }}
        onBlur={function() { setOpen(false); }}
        onChange={function(e) { props.onChange(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={function(e) {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(Math.min(hi + 1, shown.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(hi - 1, 0)); }
          else if (e.key === 'Enter' && open && shown[hi]) { e.preventDefault(); pick(shown[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {q && <button type="button" aria-label="Xóa" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-gray-400 hover:text-white hover:bg-slate-700" onMouseDown={function(e) { e.preventDefault(); props.onChange(''); setOpen(true); }}>×</button>}
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-600 bg-slate-900 shadow-xl">
          {shown.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400">Không tìm thấy sản phẩm nào khớp “{q}”.{props.emptyHint ? ' ' + props.emptyHint : ''}</div>
          ) : (
            <div>
              <div className="px-3 py-1.5 text-[11px] text-gray-500 border-b border-slate-800">{list.length} sản phẩm{list.length > shown.length ? ' (hiện 50 đầu, gõ thêm để lọc)' : ''}</div>
              {shown.map(function(p, i) {
                return (
                  <div key={p} onMouseDown={function(e) { e.preventDefault(); pick(p); }} onMouseEnter={function() { setHi(i); }} className={'px-3 py-2 cursor-pointer text-sm flex flex-wrap items-baseline gap-x-3 ' + (i === hi ? 'bg-blue-600/30 text-white' : 'text-gray-200')}>
                    <span><Hl text={p} q={q} /></span>
                    <span className="text-[11px] font-mono text-blue-300">{(props.skuOf[p] || []).slice(0, 3).join(' · ')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
