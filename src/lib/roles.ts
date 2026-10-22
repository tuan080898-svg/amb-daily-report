import type { UserRole, Region } from './types';

export var WAREHOUSE_HOME = '/kho/phieu-xuat';

// Quản lý chi nhánh (Hà Nội / HCM): chỉ XEM doanh số, số lượng bán của các shop thuộc chi nhánh mình.
// Không xem giá vốn, lãi lỗ; không nhập hay sửa báo cáo; không vào khu quản trị, kho, CSKH.
export function managerRegion(role: UserRole): Region | null {
  return role === 'manager_hn' ? 'HN' : role === 'manager_hcm' ? 'HCM' : null;
}

export function isManagerRole(role: UserRole): boolean {
  return managerRegion(role) !== null;
}

// Vai trò được nạp và xem dữ liệu giá vốn / lãi lỗ (nhân viên nhập báo cáo cần giá vốn để tính; admin xem lãi lỗ)
export function canSeeCost(role: UserRole): boolean {
  return role === 'admin' || role === 'employee';
}

// Trang quản lý chi nhánh được xem (chỉ các trang doanh số, số lượng bán)
export var MANAGER_PATHS = ['/dashboard', '/reports/history', '/reports/sku', '/reports/analytics'];

// Trang mở đầu sau khi đăng nhập theo vai trò
export function homeFor(role: UserRole): string {
  return role === 'warehouse' ? WAREHOUSE_HOME : '/dashboard';
}

export function roleLabel(role: UserRole): string {
  if (role === 'admin') return 'Admin';
  if (role === 'warehouse') return 'Nhân sự kho';
  if (role === 'manager_hn') return 'Quản lý chi nhánh Hà Nội';
  if (role === 'manager_hcm') return 'Quản lý chi nhánh HCM';
  return 'Nhân viên';
}

// Nhân sự kho chỉ vào khu /kho; quản lý chi nhánh chỉ vào các trang doanh số; nhân viên thường không vào khu /kho; admin vào tất cả.
export function canAccessPath(role: UserRole, pathname: string): boolean {
  var inKho = pathname === '/kho' || pathname.indexOf('/kho/') === 0;
  if (role === 'admin') return true;
  if (role === 'warehouse') return inKho;
  if (isManagerRole(role)) return MANAGER_PATHS.some(function(p) { return pathname === p || pathname.indexOf(p + '/') === 0; });
  return !inKho;
}
