import type { IgState, IgUser } from '@/lib/integrity';

export var inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-200 focus:border-blue-500 outline-none [color-scheme:dark]';
export var cardCls = 'bg-slate-900 border border-slate-700 rounded-xl p-4';
export var btnCls = 'px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-gray-200 text-sm rounded-lg disabled:opacity-50';
export var btnPrimaryCls = 'px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50';
export var labelCls = 'block text-xs font-medium text-gray-400 mb-1';

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

export function nameOf(users: IgUser[], id: string): string {
  var u = users.find(function(x) { return x.id === id; });
  return u ? u.name : '(tài khoản đã xóa)';
}

// Gửi một thao tác; trả true nếu thành công
export type Act = (action: string, payload: unknown, done: string) => Promise<boolean>;
