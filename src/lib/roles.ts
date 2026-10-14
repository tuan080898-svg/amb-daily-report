import type { UserRole } from './types';

export var WAREHOUSE_HOME = '/kho/phieu-xuat';

// Trang mở đầu sau khi đăng nhập theo vai trò
export function homeFor(role: UserRole): string {
  return role === 'warehouse' ? WAREHOUSE_HOME : '/dashboard';
}

export function roleLabel(role: UserRole): string {
  if (role === 'admin') return 'Admin';
  if (role === 'warehouse') return 'Nhân sự kho';
  return 'Nhân viên';
}

// Nhân sự kho chỉ vào khu /kho; nhân viên thường không vào khu /kho; admin vào tất cả.
export function canAccessPath(role: UserRole, pathname: string): boolean {
  var inKho = pathname === '/kho' || pathname.indexOf('/kho/') === 0;
  if (role === 'admin') return true;
  if (role === 'warehouse') return inKho;
  return !inKho;
}
