'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAppState } from '@/lib/store';
import { dbGetIntegrity, dbIntegrityAction, dbIntegrityRemind } from '@/lib/db';
import { IG_STATE_LABEL, igLastReport, igNeedsRestore, igState, type IgCommit, type IgData, type IgState } from '@/lib/integrity';
import { IG_CHANGED } from '@/components/IntegrityAlert';
import CommitCard from './CommitCard';
import CommitForm from './CommitForm';
import StatsView from './StatsView';
import { btnCls, btnPrimaryCls, cardCls, inputCls, type Act } from './ui';

type Tab = 'mine' | 'related' | 'all' | 'stats';
var errText = function(e: unknown) { return e instanceof Error ? e.message : String(e); };
// Việc cần xử lý lên đầu, trong cùng nhóm thì hạn gần nhất trước
var RANK: Record<IgState, number> = { 'overdue': 0, 'restoring': 1, 'open': 2, 'pending': 3, 'kept': 4, 'restored-early': 4, 'restored-late': 4, 'void': 5 };

export default function IntegrityPage() {
  var { currentUser } = useAppState();
  var [data, setData] = useState<IgData | null>(null);
  var [err, setErr] = useState('');
  var [busy, setBusy] = useState(false);
  var [toast, setToast] = useState<{ text: string; bad: boolean } | null>(null);
  var [tab, setTab] = useState<Tab>('mine');
  var [creating, setCreating] = useState(false);
  var [fState, setFState] = useState('');
  var [fUser, setFUser] = useState('');
  var [limit, setLimit] = useState(50);
  var [preview, setPreview] = useState<string | null>(null);

  var load = useCallback(function() {
    dbGetIntegrity().then(function(d) { setData(d); setErr(''); }).catch(function(e) { setErr(errText(e)); });
  }, []);

  useEffect(function() {
    load();
    // Trạng thái phụ thuộc giờ hiện tại và thao tác của người khác nên tải lại định kỳ
    var t = setInterval(load, 60000);
    return function() { clearInterval(t); };
  }, [load]);

  useEffect(function() {
    if (!toast) return;
    var t = setTimeout(function() { setToast(null); }, toast.bad ? 10000 : 5000);
    return function() { clearTimeout(t); };
  }, [toast]);

  if (!currentUser) return null;
  var me = currentUser.id;
  var isAdmin = currentUser.role === 'admin';

  var act: Act = async function(action, payload, done) {
    setBusy(true);
    try {
      var d = await dbIntegrityAction(action, payload);
      setData(d);
      setToast(d.warning ? { text: d.warning, bad: true } : { text: done, bad: false });
      window.dispatchEvent(new Event(IG_CHANGED));
      return true;
    } catch (e) {
      setToast({ text: errText(e), bad: true });
      return false;
    } finally { setBusy(false); }
  };

  async function remind(send: boolean) {
    setBusy(true);
    try {
      var r = await dbIntegrityRemind(send);
      setPreview(r.text);
      if (send) setToast({ text: r.sent ? 'Đã gửi tin nhắc vào nhóm Lark' : 'Không có gì cần nhắc', bad: false });
    } catch (e) { setToast({ text: errText(e), bad: true }); }
    finally { setBusy(false); }
  }

  var nowMs = data ? Date.parse(data.now) : 0;
  var sortList = function(l: IgCommit[]) {
    return l.slice().sort(function(a, b) {
      var ra = RANK[igState(a, nowMs)], rb = RANK[igState(b, nowMs)];
      return ra - rb || (ra >= 4 ? b.due.localeCompare(a.due) : a.due.localeCompare(b.due));
    });
  };

  var items = data ? data.items : [];
  var mine = sortList(items.filter(function(c) { return c.ownerId === me; }));
  var toVerify = sortList(items.filter(function(c) { var r = igLastReport(c); return !c.voided && c.verifierId === me && !!r && !r.verdict; }));
  var news = sortList(items.filter(function(c) { return !c.voided && !!c.restore.step1 && c.restore.step1.toIds.indexOf(me) >= 0 && !c.acks.some(function(a) { return a.userId === me; }); }));
  var related = sortList(items.filter(function(c) {
    return c.ownerId !== me && (c.relatedIds.indexOf(me) >= 0 || c.verifierId === me) && toVerify.indexOf(c) < 0 && news.indexOf(c) < 0;
  }));
  var all = sortList(items.filter(function(c) { return (!fUser || c.ownerId === fUser) && (!fState || igState(c, nowMs) === fState); }));
  var owe = mine.filter(function(c) { return igNeedsRestore(c, nowMs); }).length;

  var list = function(l: IgCommit[], empty: string) {
    if (!l.length) return <p className="text-sm text-gray-500 py-4">{empty}</p>;
    return (
      <div className="space-y-3">
        {l.slice(0, limit).map(function(c) {
          return <CommitCard key={c.id} c={c} users={data!.users} meId={me} isAdmin={isAdmin} nowIso={data!.now} busy={busy} act={act} />;
        })}
        {l.length > limit && <button className={btnCls} onClick={function() { setLimit(limit + 50); }}>Xem thêm ({l.length - limit})</button>}
      </div>
    );
  };

  var tabs: Array<[Tab, string, number]> = [
    ['mine', 'Lời của tôi', owe],
    ['related', 'Liên quan tới tôi', toVerify.length + news.length],
    ['all', 'Toàn tổ chức', 0],
    ['stats', 'Đo lường', 0],
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-100">🤝 Integrity – Trân trọng lời nói của mình</h1>
          <p className="text-sm text-gray-400 mt-1">Làm đúng, đủ điều đã nói. Hoặc ngay khi thấy nguy cơ không làm được, làm đủ 3 bước khôi phục.</p>
        </div>
        <button className={btnPrimaryCls} disabled={!data} onClick={function() { setCreating(!creating); }}>+ Tuyên bố mục tiêu</button>
      </div>

      <details className="mb-4 text-sm text-gray-400">
        <summary className="cursor-pointer text-blue-400">Integrity là gì? 3 bước khôi phục</summary>
        <div className={cardCls + ' mt-2 grid md:grid-cols-2 gap-3'}>
          <ul className="space-y-1">
            <li>• Không tốt, không xấu</li>
            <li>• Là trạng thái nguyên vẹn và hoàn tất</li>
            <li>• Là ngọn núi không có đỉnh</li>
            <li>• Là trân trọng lời nói của mình</li>
            <li>• Không phải phạm trù đạo đức</li>
          </ul>
          <ol className="space-y-1 text-gray-300">
            <li><b>1.</b> Loan tin tới những người liên quan</li>
            <li><b>2.</b> Tìm hiểu tác động của việc không giữ được lời và khắc phục</li>
            <li><b>3.</b> Đưa ra lời nói mới nếu có</li>
          </ol>
        </div>
      </details>

      {err && <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-300 text-sm rounded-lg p-3">{err} <button className="underline ml-2" onClick={load}>Thử lại</button></div>}
      {!data && !err && <p className="text-sm text-gray-500">Đang tải...</p>}

      {data && creating && (
        <div className={cardCls + ' mb-4 !border-blue-500/50'}>
          <p className="text-sm font-semibold text-gray-100 mb-3">Lời cam kết mới của {currentUser.name}</p>
          <CommitForm users={data.users} ownerId={me} nowIso={data.now} busy={busy} submitLabel="Tôi cam kết"
            onSubmit={async function(i) { if (await act('create', i, 'Đã ghi lời cam kết')) { setCreating(false); setTab('mine'); } }}
            onCancel={function() { setCreating(false); }} />
        </div>
      )}

      {data && (
        <>
          <div className="flex gap-1 border-b border-slate-700 mb-4 overflow-x-auto overflow-y-hidden" role="tablist">
            {tabs.map(function(t) {
              return (
                <button key={t[0]} role="tab" aria-selected={tab === t[0]} onClick={function() { setTab(t[0]); setLimit(50); }}
                  className={'px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ' + (tab === t[0] ? 'border-blue-500 text-blue-400 font-medium' : 'border-transparent text-gray-400')}>
                  {t[1]}{t[2] > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px]">{t[2]}</span>}
                </button>
              );
            })}
          </div>

          {tab === 'mine' && list(mine, 'Bạn chưa ghi lời cam kết nào. Bấm "+ Tuyên bố mục tiêu" để bắt đầu.')}

          {tab === 'related' && (
            <div className="space-y-5">
              {toVerify.length > 0 && <section><h2 className="text-sm font-semibold text-violet-300 mb-2">Chờ tôi nghiệm thu ({toVerify.length})</h2>{list(toVerify, '')}</section>}
              {news.length > 0 && <section><h2 className="text-sm font-semibold text-orange-300 mb-2">Tin tôi chưa xác nhận ({news.length})</h2>{list(news, '')}</section>}
              <section><h2 className="text-sm font-semibold text-gray-300 mb-2">Lời của người khác có liên quan tới tôi</h2>{list(related, 'Chưa có.')}</section>
            </div>
          )}

          {tab === 'all' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <select className={inputCls + ' !w-auto'} value={fUser} onChange={function(e) { setFUser(e.target.value); }} aria-label="Lọc theo người">
                  <option value="">Mọi người</option>
                  {data.users.map(function(u) { return <option key={u.id} value={u.id}>{u.name}</option>; })}
                </select>
                <select className={inputCls + ' !w-auto'} value={fState} onChange={function(e) { setFState(e.target.value); }} aria-label="Lọc theo trạng thái">
                  <option value="">Mọi trạng thái</option>
                  {(Object.keys(IG_STATE_LABEL) as IgState[]).map(function(s) { return <option key={s} value={s}>{IG_STATE_LABEL[s]}</option>; })}
                </select>
              </div>
              {list(all, 'Không có lời nào khớp bộ lọc.')}
            </div>
          )}

          {tab === 'stats' && <StatsView data={data} />}

          {isAdmin && (
            <div className={cardCls + ' mt-6'}>
              <p className="text-sm font-medium text-gray-200">Nhắc hạn qua Lark</p>
              <p className="text-xs text-gray-500 mt-1">
                Tự gửi khoảng 8h mỗi sáng: lời quá hạn, đến hạn hôm nay, ngày mai và chờ nghiệm thu. {data.larkReady ? 'Đã nối nhóm Lark.' : 'Chưa nối nhóm Lark: cần đặt LARK_INTEGRITY_WEBHOOK và CRON_SECRET trên Vercel.'}
              </p>
              <div className="flex gap-2 mt-3">
                <button className={btnCls} disabled={busy} onClick={function() { remind(false); }}>Xem trước tin</button>
                <button className={btnCls} disabled={busy || !data.larkReady} onClick={function() { if (window.confirm('Gửi tin nhắc vào nhóm Lark ngay?')) remind(true); }}>Gửi nhắc ngay</button>
              </div>
              {preview !== null && <pre className="mt-3 text-xs text-gray-300 bg-slate-950 rounded-lg p-3 whitespace-pre-wrap">{preview || 'Hiện không có lời nào cần nhắc.'}</pre>}
            </div>
          )}
        </>
      )}

      {toast && (
        <div role="status" className={'fixed bottom-20 md:bottom-4 right-4 z-[70] max-w-[90vw] md:max-w-md whitespace-pre-wrap text-sm text-white rounded-xl shadow-xl px-4 py-3 ' + (toast.bad ? 'bg-red-700' : 'bg-green-700')}>{toast.text}</div>
      )}
    </div>
  );
}
