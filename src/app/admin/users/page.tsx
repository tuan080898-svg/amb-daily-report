'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/store';
import { User, UserRole } from '@/lib/types';

export default function AdminUsersPage() {
  const { currentUser, users, shops, addUser, updateUser } = useAppState();
  const [editing, setEditing] = useState<User | null>(null);
  const [isNew, setIsNew] = useState(false);

  if (!currentUser || currentUser.role !== 'admin') {
    return <div className="p-6 text-red-400">Bạn không có quyền truy cập trang này.</div>;
  }

  function handleNew() {
    setEditing({
      id: `u${Date.now()}`,
      email: '',
      name: '',
      role: 'employee',
      assignedShops: [],
      password: '123456',
    });
    setIsNew(true);
  }

  function handleSave(user: User) {
    if (isNew) {
      addUser(user);
    } else {
      updateUser(user);
    }
    setEditing(null);
    setIsNew(false);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Quản lý User</h1>
          <p className="text-sm text-gray-500 mt-1">{users.length} tài khoản</p>
        </div>
        <button onClick={handleNew} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500">
          + Thêm user
        </button>
      </div>

      {editing && (
        <UserForm
          user={editing}
          shops={shops}
          onSave={handleSave}
          onCancel={() => { setEditing(null); setIsNew(false); }}
          isNew={isNew}
        />
      )}

      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700/50">
              <th className="text-left px-4 py-3 font-medium text-gray-400">Tên</th>
              <th className="text-left px-4 py-3 font-medium text-gray-400">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-400">Vai trò</th>
              <th className="text-left px-4 py-3 font-medium text-gray-400">Shop phụ trách</th>
              <th className="text-right px-4 py-3 font-medium text-gray-400">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map(user => {
              const assignedShopNames = shops.filter(s => user.assignedShops.includes(s.id)).map(s => s.name);
              return (
                <tr key={user.id} className="hover:bg-slate-800">
                  <td className="px-4 py-3 font-medium text-gray-100">{user.name}</td>
                  <td className="px-4 py-3 text-gray-400">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      user.role === 'admin' ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400'
                    }`}>{user.role === 'admin' ? 'Admin' : 'Nhân viên'}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 max-w-[300px]">
                    {user.role === 'admin' ? 'Tất cả' : (assignedShopNames.join(', ') || '—')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEditing(user); setIsNew(false); }} className="text-blue-400 hover:underline text-xs">Sửa</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserForm({ user, shops, onSave, onCancel, isNew }: {
  user: User;
  shops: { id: string; name: string; channel: string }[];
  onSave: (user: User) => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [form, setForm] = useState({ ...user });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) { alert('Vui lòng nhập đầy đủ'); return; }
    onSave(form);
  }

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 mb-6">
      <h2 className="font-medium text-gray-100 mb-4">{isNew ? 'Thêm user mới' : 'Sửa user'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Tên</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Vai trò</label>
            <select
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
              className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="employee">Nhân viên</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Mật khẩu {isNew ? '' : '(để trống = giữ nguyên)'}</label>
            <input
              type="text"
              value={form.password || ''}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={isNew ? 'Nhập mật khẩu' : '••••••'}
            />
          </div>
        </div>
        {form.role === 'employee' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Shop phụ trách</label>
            <select
              multiple
              value={form.assignedShops}
              onChange={e => setForm(f => ({ ...f, assignedShops: Array.from(e.target.selectedOptions, o => o.value) }))}
              className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              size={5}
            >
              {shops.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.channel})</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Giữ Ctrl để chọn nhiều shop</p>
          </div>
        )}
        <div className="flex gap-3">
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500">
            {isNew ? 'Thêm' : 'Lưu'}
          </button>
          <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-800 text-gray-300 rounded-lg text-sm font-medium hover:bg-slate-700">
            Huỷ
          </button>
        </div>
      </form>
    </div>
  );
}
