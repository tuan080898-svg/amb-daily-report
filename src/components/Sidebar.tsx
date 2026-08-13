'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppState } from '@/lib/store';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['admin', 'employee'] },
  { href: '/planning', label: 'Kế hoạch tháng', icon: '🎯', roles: ['admin', 'employee'] },
  { href: '/reports', label: 'Nhập báo cáo', icon: '📝', roles: ['admin', 'employee'] },
  { href: '/reports/history', label: 'Lịch sử báo cáo', icon: '📋', roles: ['admin', 'employee'] },
  { href: '/reports/sku', label: 'SP bán chạy', icon: '🏆', roles: ['admin', 'employee'] },
  { href: '/reports/analytics', label: 'Phân tích', icon: '📈', roles: ['admin', 'employee'] },
  { href: '/cskh', label: 'CSKH Dashboard', icon: '🛡️', roles: ['admin', 'employee'] },
  { href: '/cskh/report', label: 'Báo cáo CSKH', icon: '📞', roles: ['admin', 'employee'] },
  { href: '/admin/sku', label: 'Quản lý SKU', icon: '🏷️', roles: ['admin'] },
  { href: '/admin/inventory', label: 'Quản lý Kho', icon: '📦', roles: ['admin'] },
  { href: '/admin/shops', label: 'Quản lý shop', icon: '🏪', roles: ['admin'] },
  { href: '/admin/targets', label: 'KPI tháng', icon: '💰', roles: ['admin'] },
  { href: '/admin/users', label: 'Quản lý user', icon: '👥', roles: ['admin'] },
  { href: '/admin/config', label: 'Cấu hình', icon: '⚙️', roles: ['admin'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { currentUser, logout } = useAppState();

  if (!currentUser) return null;

  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(currentUser.role));

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-700/50 flex flex-col min-h-screen">
      <div className="p-4 border-b border-slate-700/50">
        <h1 className="text-lg font-bold text-blue-400">AMB Daily Report</h1>
        <p className="text-xs text-gray-500 mt-1">Báo cáo doanh số hàng ngày</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {visibleItems.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-500/15 text-blue-400'
                  : 'text-gray-400 hover:bg-slate-800 hover:text-gray-200'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-700/50">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-bold">
            {currentUser.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">{currentUser.name}</p>
            <p className="text-xs text-gray-500 truncate">{currentUser.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-left"
        >
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
