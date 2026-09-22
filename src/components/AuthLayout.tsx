'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAppState } from '@/lib/store';
import Sidebar, { MobileBottomNav } from './Sidebar';
import AiChat from './AiChat';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAppState();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!currentUser) {
      router.replace('/login');
    }
  }, [currentUser, router]);

  if (!currentUser) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-slate-950">
        <div className="md:hidden sticky top-0 z-40 bg-slate-900 border-b border-slate-700/50 px-4 py-3 flex items-center gap-3">
          <h1 className="text-sm font-bold text-blue-400">AMB Report</h1>
          <span className="text-xs text-gray-500">|</span>
          <span className="text-xs text-gray-400 truncate">{getPageTitle(pathname)}</span>
        </div>
        <div className="pb-16 md:pb-0">
          {children}
        </div>
      </main>
      <MobileBottomNav />
      <AiChat />
    </div>
  );
}

function getPageTitle(pathname: string): string {
  const map: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/planning': 'Kế hoạch tháng',
    '/reports': 'Nhập báo cáo',
    '/reports/history': 'Lịch sử',
    '/reports/sku': 'SP bán chạy',
    '/reports/analytics': 'Phân tích',
    '/cskh': 'CSKH Dashboard',
    '/cskh/report': 'Báo cáo CSKH',
    '/checklist': 'Checklist',
    '/admin/pnl': 'Lãi lỗ (PnL)',
    '/admin/sku': 'Quản lý SKU',
    '/admin/inventory': 'Kho',
    '/admin/shops': 'Shop',
    '/admin/targets': 'KPI tháng',
    '/admin/users': 'User',
    '/admin/config': 'Cấu hình',
  };
  return map[pathname] || 'AMB Report';
}
