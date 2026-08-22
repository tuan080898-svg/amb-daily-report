'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/store';
import { User, UserRole } from '@/lib/types';

export default function AdminUsersPage() {
  const { currentUser, users, shops, addUser, updateUser, deleteUser } = useAppState();
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
      password: '',
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
                  <td className="px-4 py-3 text-right space-x-3">
                    <button onClick={() => { setEditing(user); setIsNew(false); }} className="text-blue-400 hover:underline text-xs">Sửa</button>
                    {user.id !== currentUser.id && (
                      <button onClick={() => { if (confirm('Xóa user "' + user.name + '"? Thao tác không thể hoàn tác.')) deleteUser(user.id); }} className="text-red-400 hover:underline text-xs">Xóa</button>
                    )}
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
    if (isNew && !form.password?.trim()) { alert('Vui lòng nhập mật khẩu cho user mới'); return; }
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
              type="password"
              autoComplete="new-password"
              value={form.password || ''}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={isNew ? 'Nhập mật khẩu' : '••••••'}
            />
          </div>
        </div>
        {form.role === 'employee' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Shop phụ trách</label>
            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-800 border border-slate-600 rounded-lg max-h-[200px] overflow-y-auto">
              {shops.map(s => (
                <label key={s.id} className="flex items-center gap-2 text-sm text-gray-300 hover:text-gray-100 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={form.assignedShops.includes(s.id)}
                    onChange={e => {
                      setForm(f => ({
                        ...f,
                        assignedShops: e.target.checked
                          ? [...f.assignedShops, s.id]
                          : f.assignedShops.filter(id => id !== s.id),
                      }));
                    }}
                    className="rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500"
                  />
                  <span>{s.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${s.channel === 'Shopee' ? 'bg-orange-500/15 text-orange-400' : 'bg-pink-500/15 text-pink-400'}`}>{s.channel}</span>
                </label>
              ))}
            </div>
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
