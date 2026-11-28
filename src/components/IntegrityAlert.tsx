'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { dbGetIntegritySummary } from '@/lib/db';
import type { IgSummary } from '@/lib/integrity';

export const IG_CHANGED = 'amb-integrity-changed';

// Thanh nhắc trên mọi trang: lời quá hạn chưa khôi phục, đến hạn hôm nay, chờ nghiệm thu, tin chưa xác nhận.
export default function IntegrityAlert() {
  const pathname = usePathname();
  const [s, setS] = useState<IgSummary | null>(null);

  useEffect(function() {
    var alive = true;
    function check() {
      dbGetIntegritySummary().then(function(r) { if (alive) setS(r); }).catch(function() { /* không tải được thì thôi, lần sau thử lại */ });
    }
    check();
    var timer = setInterval(check, 5 * 60 * 1000);
    window.addEventListener(IG_CHANGED, check);
    return function() { alive = false; clearInterval(timer); window.removeEventListener(IG_CHANGED, check); };
  }, [pathname]);

  // Trang Integrity đã xếp các việc này lên đầu nên không nhắc hai lần
  if (pathname === '/integrity') return null;
  if (!s || !(s.overdue || s.dueToday || s.toVerify || s.news)) return null;
  const parts: string[] = [];
  if (s.overdue) parts.push(s.overdue + ' lời của bạn cần khôi phục Integrity');
  if (s.dueToday) parts.push(s.dueToday + ' lời đến hạn hôm nay');
  if (s.toVerify) parts.push(s.toVerify + ' kết quả chờ bạn nghiệm thu');
  if (s.news) parts.push(s.news + ' tin chờ bạn xác nhận');

  return (
    <div role={s.overdue ? 'alert' : 'status'}
      className={'mx-3 md:mx-6 mt-3 rounded-xl px-4 py-2.5 text-sm flex flex-wrap items-center gap-x-3 gap-y-1 border ' + (s.overdue ? 'bg-red-600/20 border-red-500 text-red-200' : 'bg-amber-500/10 border-amber-500/40 text-amber-200')}>
      <span>🤝 {parts.join(' · ')}</span>
      <Link href="/integrity" className="font-semibold underline">{s.overdue ? 'Làm 3 bước ngay' : 'Xem'}</Link>
    </div>
  );
}
