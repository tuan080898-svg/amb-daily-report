'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppState } from '@/lib/store';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: string[];
}

interface NavGroup {
  key: string;
  label: string;
  icon: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'overview',
    label: 'Tổng quan',
    icon: '📊',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['admin', 'employee'] },
      { href: '/planning', label: 'Kế hoạch tháng', icon: '🎯', roles: ['admin', 'employee'] },
    ],
  },
  {
    key: 'reports',
    label: 'Báo cáo',
    icon: '📝',
    items: [
      { href: '/reports', label: 'Nhập báo cáo', icon: '📝', roles: ['admin', 'employee'] },
      { href: '/reports/history', label: 'Lịch sử', icon: '📋', roles: ['admin', 'employee'] },
      { href: '/reports/sku', label: 'SP bán chạy', icon: '🏆', roles: ['admin', 'employee'] },
      { href: '/reports/analytics', label: 'Phân tích', icon: '📈', roles: ['admin', 'employee'] },
    ],
  },
  {
    key: 'cskh',
    label: 'CSKH',
    icon: '🛡️',
    items: [
      { href: '/cskh', label: 'Dashboard', icon: '🛡️', roles: ['admin', 'employee'] },
      { href: '/cskh/report', label: 'Báo cáo', icon: '📞', roles: ['admin', 'employee'] },
      { href: '/checklist', label: 'Checklist', icon: '✅', roles: ['admin', 'employee'] },
    ],
  },
  {
    key: 'admin',
    label: 'Quản trị',
    icon: '⚙️',
    items: [
      { href: '/admin/pnl', label: 'Lãi lỗ (PnL)', icon: '💹', roles: ['admin'] },
      { href: '/admin/sku', label: 'Quản lý SKU', icon: '🏷️', roles: ['admin'] },
      { href: '/admin/inventory', label: 'Kho', icon: '📦', roles: ['admin'] },
      { href: '/admin/shops', label: 'Shop', icon: '🏪', roles: ['admin'] },
      { href: '/admin/targets', label: 'KPI tháng', icon: '💰', roles: ['admin'] },
      { href: '/admin/users', label: 'User', icon: '👥', roles: ['admin'] },
      { href: '/admin/config', label: 'Cấu hình', icon: '⚙️', roles: ['admin'] },
    ],
  },
];

function isItemActive(pathname: string, href: string): boolean {
  if (href === '/reports') return pathname === '/reports';
  if (href === '/cskh') return pathname === '/cskh';
  return pathname === href || pathname.startsWith(href + '/');
}

function getActiveGroup(pathname: string, groups: NavGroup[]): string | null {
  for (const g of groups) {
    for (const item of g.items) {
      if (isItemActive(pathname, item.href)) return g.key;
    }
  }
  return null;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { currentUser, logout } = useAppState();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  useEffect(function () {
    const active = getActiveGroup(pathname, NAV_GROUPS);
    if (active) {
      setExpanded(function (prev) {
        if (prev[active]) return prev;
        return { ...prev, [active]: true };
      });
    }
  }, [pathname]);

  if (!currentUser) return null;

  const visibleGroups = NAV_GROUPS.map(function (g) {
    const items = g.items.filter(function (item) { return item.roles.includes(currentUser.role); });
    return items.length > 0 ? { ...g, items: items } : null;
  }).filter(Boolean) as NavGroup[];

  function toggleGroup(key: string) {
    setExpanded(function (prev) { return { ...prev, [key]: !prev[key] }; });
  }

  if (collapsed) {
    return (
      <aside className="w-16 bg-slate-900 border-r border-slate-700/50 flex flex-col min-h-screen">
        <div className="p-3 border-b border-slate-700/50 flex justify-center">
          <button
            onClick={function () { setCollapsed(false); }}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-gray-400 transition-colors"
            title="Mở rộng menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {visibleGroups.map(function (g) {
            const hasActive = g.items.some(function (item) { return isItemActive(pathname, item.href); });
            return (
              <Link
                key={g.key}
                href={g.items[0].href}
                className={'flex items-center justify-center p-2.5 rounded-lg text-lg transition-colors ' + (hasActive ? 'bg-blue-500/15' : 'hover:bg-slate-800')}
                title={g.label}
              >
                {g.icon}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-700/50 flex justify-center">
          <div
            className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-bold cursor-pointer"
            title={currentUser.name}
          >
            {currentUser.name.charAt(0)}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-60 bg-slate-900 border-r border-slate-700/50 flex flex-col min-h-screen">
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-blue-400 leading-tight">AMB Daily Report</h1>
          <p className="text-[10px] text-gray-500">Báo cáo doanh số hàng ngày</p>
        </div>
        <button
          onClick={function () { setCollapsed(true); }}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-gray-400 transition-colors"
          title="Thu gọn menu"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {visibleGroups.map(function (g) {
          const isOpen = !!expanded[g.key];
          const hasActive = g.items.some(function (item) { return isItemActive(pathname, item.href); });

          return (
            <div key={g.key}>
              <button
                onClick={function () { toggleGroup(g.key); }}
                className={'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ' + (hasActive ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300 hover:bg-slate-800/50')}
              >
                <span className="text-sm">{g.icon}</span>
                <span className="flex-1 text-left">{g.label}</span>
                <svg className={'w-3.5 h-3.5 transition-transform ' + (isOpen ? 'rotate-90' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {isOpen && (
                <div className="ml-3 pl-3 border-l border-slate-700/40 space-y-0.5 mt-0.5 mb-1">
                  {g.items.map(function (item) {
                    const active = isItemActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ' + (
                          active
                            ? 'bg-blue-500/15 text-blue-400 font-medium'
                            : 'text-gray-400 hover:bg-slate-800 hover:text-gray-200'
                        )}
                      >
                        <span className="text-xs">{item.icon}</span>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-slate-700/50">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-xs font-bold">
            {currentUser.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-200 truncate">{currentUser.name}</p>
            <p className="text-[10px] text-gray-500 truncate">{currentUser.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-left"
        >
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
