'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAppState } from '@/lib/store';
import { dbGetIntegrity, dbIntegrityAction, dbIntegrityRemind } from '@/lib/db';
import { igDay, igLastReport, igNeedsRestore, igState, type IgCommit, type IgData, type IgState } from '@/lib/integrity';
import { IG_CHANGED } from '@/components/IntegrityAlert';
import ActionDialog from './ActionDialog';
import CommitCard from './CommitCard';
import CommitForm from './CommitForm';
import Dialog from './Dialog';
import StatsView from './StatsView';
import { btnCls, btnPrimaryCls, cardCls, chipCls, inputCls, type Act, type DialogKind } from './ui';

type Tab = 'mine' | 'team' | 'stats';
type Group = 'attention' | 'doing' | 'closed' | 'all';
var GROUPS: Array<[Group, string, IgState[]]> = [
  ['attention', 'Cần chú ý', ['overdue', 'restoring']],
  ['doing', 'Đang làm', ['open', 'pending']],
  ['closed', 'Đã khép', ['kept', 'restored-early', 'restored-late']],
  ['all', 'Tất cả', []],
];
var errText = function(e: unknown) { return e instanceof Error ? e.message : String(e); };

export default function IntegrityPage() {
  var { currentUser } = useAppState();
  var [data, setData] = useState<IgData | null>(null);
  var [err, setErr] = useState('');
  var [busy, setBusy] = useState(false);
  var [toast, setToast] = useState<{ text: string; bad: boolean } | null>(null);
  var [tab, setTab] = useState<Tab>('mine');
  var [creating, setCreating] = useState(false);
  var [dialog, setDialog] = useState<{ kind: DialogKind; id: string } | null>(null);
  var [group, setGroup] = useState<Group>('attention');
  var [fUser, setFUser] = useState('');
  var [limit, setLimit] = useState(30);
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
  var today = data ? igDay(data.now) : '';
  var items = data ? data.items : [];
  var byDue = function(l: IgCommit[]) { return l.slice().sort(function(a, b) { return a.due.localeCompare(b.due); }); };
  var newest = function(l: IgCommit[]) { return l.slice().sort(function(a, b) { return b.due.localeCompare(a.due); }); };

  // Chia việc của tôi theo điều tôi phải làm; mỗi lời chỉ xuất hiện ở một nhóm
  var mine = items.filter(function(c) { return c.ownerId === me; });
  var myRestore = byDue(mine.filter(function(c) { return igNeedsRestore(c, nowMs); }));
  var toVerify = byDue(items.filter(function(c) { var r = igLastReport(c); return !c.voided && c.ownerId !== me && c.verifierId === me && !!r && !r.verdict; }));
  var news = byDue(items.filter(function(c) { return toVerify.indexOf(c) < 0 && !c.voided && !!c.restore.step1 && c.restore.step1.toIds.indexOf(me) >= 0 && !c.acks.some(function(a) { return a.userId === me; }); }));
  var open = byDue(mine.filter(function(c) { return igState(c, nowMs) === 'open'; }));
  var dueToday = open.filter(function(c) { return igDay(c.due) === today; });
  var later = open.filter(function(c) { return igDay(c.due) !== today; });
  var pending = byDue(mine.filter(function(c) { return igState(c, nowMs) === 'pending'; }));
  var done = newest(mine.filter(function(c) { var s = igState(c, nowMs); return s === 'kept' || s === 'restored-early' || s === 'restored-late' || s === 'void'; }));
  var related = newest(items.filter(function(c) { return c.ownerId !== me && !c.voided && (c.relatedIds.indexOf(me) >= 0 || c.verifierId === me) && toVerify.indexOf(c) < 0 && news.indexOf(c) < 0; }));
  var urgent = myRestore.concat(toVerify, news, dueToday);

  var inGroup = function(c: IgCommit, g: Group) {
    var states = GROUPS.find(function(x) { return x[0] === g; })![2];
    return (!fUser || c.ownerId === fUser) && (g === 'all' || states.indexOf(igState(c, nowMs)) >= 0);
  };
  var teamRaw = items.filter(function(c) { return inGroup(c, group); });
  var team = group === 'attention' || group === 'doing' ? byDue(teamRaw) : newest(teamRaw);

  var card = function(c: IgCommit) {
    return <CommitCard key={c.id} c={c} users={data!.users} meId={me} isAdmin={isAdmin} nowIso={data!.now} busy={busy} act={act} open={function(kind, id) { setDialog({ kind: kind, id: id }); }} />;
  };
  var section = function(title: string, l: IgCommit[], color: string) {
    if (!l.length) return null;
    return (
      <section>
        <h2 className={'text-sm font-bold mb-2 ' + color}>{title} <span className="text-gray-500 font-normal">({l.length})</span></h2>
        <div className="space-y-2.5">{l.map(card)}</div>
      </section>
    );
  };
  var folded = function(title: string, l: IgCommit[]) {
    if (!l.length) return null;
    return (
      <details>
        <summary className="cursor-pointer text-sm font-medium text-gray-400 py-1">{title} ({l.length})</summary>
        <div className="space-y-2.5 mt-2">{l.slice(0, limit).map(card)}
          {l.length > limit && <button className={btnCls} onClick={function() { setLimit(limit + 30); }}>Xem thêm ({l.length - limit})</button>}
        </div>
      </details>
    );
  };

  var current = dialog && data ? items.find(function(c) { return c.id === dialog!.id; }) : undefined;
  var tabs: Array<[Tab, string, number]> = [['mine', 'Việc của tôi', urgent.length], ['team', 'Cả đội', 0], ['stats', 'Bảng điểm', 0]];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-xl md:text-2xl font-bold text-gray-100">🤝 Integrity</h1>
        <button className={btnPrimaryCls + ' !py-2.5'} disabled={!data} onClick={function() { setCreating(true); }}>+ Tôi cam kết</button>
      </div>
      <p className="text-sm text-gray-400">Trân trọng lời nói của mình. Cả tổ chức cùng xem.</p>
      <details className="mt-2 mb-4 text-sm">
        <summary className="cursor-pointer text-blue-400">Cách dùng</summary>
        <div className={cardCls + ' mt-2 space-y-2 text-gray-300'}>
          <p><b>1. Cam kết:</b> bấm &quot;+ Tôi cam kết&quot;, trả lời việc gì, khi nào, liên quan ai.</p>
          <p><b>2. Làm xong:</b> bấm &quot;Báo đã xong&quot; kèm bằng chứng, người nghiệm thu xác nhận.</p>
          <p><b>3. Không kịp:</b> báo ngay, đừng đợi tới hạn. Làm đủ 3 bước: báo cho mọi người liên quan → tìm hiểu tác động và khắc phục → hứa lại (nếu có).</p>
          <p className="text-gray-500">Integrity không tốt, không xấu và không phải phạm trù đạo đức. Đó là trạng thái nguyên vẹn, hoàn tất: ngọn núi không có đỉnh.</p>
        </div>
      </details>

      {err && <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-300 text-sm rounded-lg p-3">{err} <button className="underline ml-2" onClick={load}>Thử lại</button></div>}
      {!data && !err && <p className="text-sm text-gray-500">Đang tải...</p>}

      {data && (
        <>
          <div className="flex border-b border-slate-700 mb-4" role="tablist">
            {tabs.map(function(t) {
              return (
                <button key={t[0]} role="tab" aria-selected={tab === t[0]} onClick={function() { setTab(t[0]); setLimit(30); }}
                  className={'flex-1 px-2 py-2.5 text-sm font-medium border-b-2 ' + (tab === t[0] ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400')}>
                  {t[1]}{t[2] > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px]">{t[2]}</span>}
                </button>
              );
            })}
          </div>

          {tab === 'mine' && (
            <div className="space-y-5">
              {urgent.length === 0 && (
                <div className={cardCls + ' text-center py-6'}>
                  <p className="text-gray-200 font-medium">{mine.length ? '✅ Không có việc gấp hôm nay' : 'Bạn chưa có lời cam kết nào'}</p>
                  <p className="text-sm text-gray-500 mt-1">{mine.length ? 'Bạn đang nguyên vẹn với các lời đã đến hạn.' : 'Bắt đầu bằng một việc nhỏ bạn chắc chắn làm trong hôm nay.'}</p>
                  {!mine.length && <button className={btnPrimaryCls + ' mt-3'} onClick={function() { setCreating(true); }}>+ Ghi lời đầu tiên</button>}
                </div>
              )}
              {section('Cần khôi phục', myRestore, 'text-red-300')}
              {section('Chờ bạn nghiệm thu', toVerify, 'text-violet-300')}
              {section('Tin báo cho bạn', news, 'text-orange-300')}
              {section('Đến hạn hôm nay', dueToday, 'text-yellow-200')}
              {section('Sắp tới', later, 'text-blue-300')}
              {section('Đã báo xong, chờ nghiệm thu', pending, 'text-gray-300')}
              {folded('Đã khép lại', done)}
              {folded('Lời của người khác có liên quan tới bạn', related)}
            </div>
          )}

          {tab === 'team' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {GROUPS.map(function(g) {
                  return <button key={g[0]} aria-pressed={group === g[0]} className={chipCls(group === g[0])} onClick={function() { setGroup(g[0]); setLimit(30); }}>{g[1]} ({items.filter(function(c) { return inGroup(c, g[0]); }).length})</button>;
                })}
              </div>
              <select className={inputCls} value={fUser} onChange={function(e) { setFUser(e.target.value); }} aria-label="Lọc theo người">
                <option value="">Mọi người</option>
                {data.users.map(function(u) { return <option key={u.id} value={u.id}>{u.name}</option>; })}
              </select>
              {team.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">{group === 'attention' ? '✅ Không có lời nào cần chú ý.' : 'Chưa có lời nào trong nhóm này.'}</p>}
              <div className="space-y-2.5">{team.slice(0, limit).map(card)}</div>
              {team.length > limit && <button className={btnCls} onClick={function() { setLimit(limit + 30); }}>Xem thêm ({team.length - limit})</button>}
            </div>
          )}

          {tab === 'stats' && (
            <>
              <StatsView data={data} />
              {isAdmin && (
                <details className={cardCls + ' mt-4'}>
                  <summary className="cursor-pointer text-sm font-medium text-gray-200">Nhắc hạn qua Lark (admin) · {data.larkReady ? 'đã nối' : 'chưa nối'}</summary>
                  <p className="text-xs text-gray-500 mt-2">
                    Tin tổng hợp tự gửi khoảng 8h mỗi sáng: lời quá hạn, đến hạn hôm nay, ngày mai và chờ nghiệm thu. Tin báo ngay khi có lời quá hạn chạy theo lịch đặt trên Supabase.{data.larkReady ? '' : ' Cần đặt LARK_INTEGRITY_WEBHOOK và CRON_SECRET trên Vercel.'}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button className={btnCls} disabled={busy} onClick={function() { remind(false); }}>Xem trước tin</button>
                    <button className={btnCls} disabled={busy || !data.larkReady} onClick={function() { if (window.confirm('Gửi tin nhắc vào nhóm Lark ngay?')) remind(true); }}>Gửi nhắc ngay</button>
                  </div>
                  {preview !== null && <pre className="mt-3 text-xs text-gray-300 bg-slate-950 rounded-lg p-3 whitespace-pre-wrap">{preview || 'Hiện không có lời nào cần nhắc.'}</pre>}
                </details>
              )}
            </>
          )}
        </>
      )}

      {data && creating && (
        <Dialog title="Lời cam kết mới" onClose={function() { setCreating(false); }}>
          <CommitForm users={data.users} ownerId={me} nowIso={data.now} busy={busy} submitLabel="Tôi cam kết"
            onSubmit={async function(i) { if (await act('create', i, 'Đã ghi lời cam kết')) { setCreating(false); setTab('mine'); } }} />
        </Dialog>
      )}
      {data && dialog && current && (
        <ActionDialog key={dialog.kind + dialog.id} kind={dialog.kind} c={current} users={data.users} meId={me} nowIso={data.now} busy={busy} act={act} onClose={function() { setDialog(null); }} />
      )}

      {toast && (
        <div role="status" className={'fixed top-3 left-1/2 -translate-x-1/2 z-[70] w-max max-w-[92vw] md:max-w-md whitespace-pre-wrap text-sm text-white rounded-xl shadow-xl px-4 py-3 ' + (toast.bad ? 'bg-red-700' : 'bg-green-700')}>{toast.text}</div>
      )}
    </div>
  );
}
