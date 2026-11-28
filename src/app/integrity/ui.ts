import type { IgState, IgUser } from '@/lib/integrity';

export var inputCls = 'w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-base md:text-sm text-gray-100 placeholder:text-gray-500 focus:border-blue-500 outline-none [color-scheme:dark]';
export var cardCls = 'bg-slate-900 border border-slate-700 rounded-xl p-4';
export var btnCls = 'px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-gray-200 text-sm rounded-lg disabled:opacity-50';
export var btnPrimaryCls = 'px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed';
export var btnDangerCls = 'px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed';
export var btnLinkCls = 'px-1 py-2 text-sm text-gray-400 hover:text-gray-100 underline-offset-2 hover:underline disabled:opacity-50';
export var labelCls = 'block text-sm font-medium text-gray-200 mb-1.5';
export var hintCls = 'text-xs text-gray-500 mt-1';

export function chipCls(on: boolean): string {
  return 'px-3 py-1.5 rounded-full text-sm border ' + (on ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-600 text-gray-300 hover:border-slate-400');
}

export var BADGE: Record<IgState, string> = {
  'open': 'bg-blue-500/20 text-blue-300',
  'pending': 'bg-violet-500/20 text-violet-300',
  'overdue': 'bg-red-600 text-white',
  'restoring': 'bg-orange-500/25 text-orange-300',
  'kept': 'bg-green-500/20 text-green-300',
  'restored-early': 'bg-teal-500/20 text-teal-300',
  'restored-late': 'bg-yellow-500/20 text-yellow-200',
  'void': 'bg-slate-700 text-gray-400',
};

// Vạch màu bên trái thẻ: nhìn lướt là biết lời nào đang cần chú ý
export var STRIPE: Record<IgState, string> = {
  'open': 'border-l-blue-500', 'pending': 'border-l-violet-500', 'overdue': 'border-l-red-500', 'restoring': 'border-l-orange-500',
  'kept': 'border-l-green-500', 'restored-early': 'border-l-teal-500', 'restored-late': 'border-l-yellow-400', 'void': 'border-l-slate-600',
};

export function nameOf(users: IgUser[], id: string): string {
  var u = users.find(function(x) { return x.id === id; });
  return u ? u.name : '(tài khoản đã xóa)';
}

// Gửi một thao tác; trả true nếu thành công
export type Act = (action: string, payload: unknown, done: string) => Promise<boolean>;

export type DialogKind = 'report' | 'verify' | 'restore' | 'void';
