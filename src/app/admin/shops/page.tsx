'use client';

import { useState, useMemo } from 'react';
import { useAppState } from '@/lib/store';
import { Shop, Channel, Region } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

export default function AdminShopsPage() {
  const { currentUser, shops, users, addShop, updateShop, deleteShop } = useAppState();
  const [editing, setEditing] = useState<Shop | null>(null);
  const [isNew, setIsNew] = useState(false);

  if (!currentUser || currentUser.role !== 'admin') {
    return <div className="p-6 text-red-400">Bạn không có quyền truy cập trang này.</div>;
  }

  function handleNew() {
    setEditing({
      id: `s${Date.now()}`,
      name: '',
      channel: 'Shopee',
      region: 'HCM',
      assignedTo: [],
      defaultMonthlyTarget: 0,
    });
    setIsNew(true);
  }

  function handleSave(shop: Shop) {
    if (isNew) {
      addShop(shop);
    } else {
      updateShop(shop);
    }
    setEditing(null);
    setIsNew(false);
  }

  function handleDelete(shopId: string) {
    if (confirm('Xóa shop này?')) {
      deleteShop(shopId);
    }
  }

  const employees = users.filter(u => u.role === 'employee');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Quản lý Shop</h1>
          <p className="text-sm text-gray-500 mt-1">{shops.length} shop</p>
        </div>
        <button onClick={handleNew} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500">
          + Thêm shop
        </button>
      </div>

      {editing && (
        <ShopForm
          shop={editing}
          employees={employees}
          onSave={handleSave}
          onCancel={() => { setEditing(null); setIsNew(false); }}
          isNew={isNew}
        />
      )}

      <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700/50">
              <th className="text-left px-4 py-3 font-medium text-gray-400">Tên shop</th>
              <th className="text-left px-4 py-3 font-medium text-gray-400">Kênh</th>
              <th className="text-left px-4 py-3 font-medium text-gray-400">Khu vực</th>
              <th className="text-left px-4 py-3 font-medium text-gray-400">Người phụ trách</th>
              <th className="text-right px-4 py-3 font-medium text-gray-400">Target mặc định/tháng</th>
              <th className="text-right px-4 py-3 font-medium text-gray-400">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {shops.map(shop => {
              const assignees = users.filter(u => shop.assignedTo.includes(u.id));
              return (
                <tr key={shop.id} className="hover:bg-slate-800">
                  <td className="px-4 py-3 font-medium text-gray-100">{shop.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      shop.channel === 'Shopee' ? 'bg-orange-500/15 text-orange-400' : 'bg-pink-500/15 text-pink-400'
                    }`}>{shop.channel}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      shop.region === 'HCM' ? 'bg-blue-500/15 text-blue-400' : 'bg-violet-500/15 text-violet-400'
                    }`}>{shop.region}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{assignees.map(u => u.name).join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{formatCurrency(shop.defaultMonthlyTarget)}đ</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => { setEditing(shop); setIsNew(false); }} className="text-blue-400 hover:underline text-xs">Sửa</button>
                    <button onClick={() => handleDelete(shop.id)} className="text-red-400 hover:underline text-xs">Xóa</button>
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

function ShopForm({ shop, employees, onSave, onCancel, isNew }: {
  shop: Shop;
  employees: { id: string; name: string }[];
  onSave: (shop: Shop) => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [form, setForm] = useState({ ...shop });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { alert('Vui lòng nhập tên shop'); return; }
    onSave(form);
  }

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 mb-6">
      <h2 className="font-medium text-gray-100 mb-4">{isNew ? 'Thêm shop mới' : 'Sửa shop'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Tên shop</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Kênh</label>
            <select
              value={form.channel}
              onChange={e => setForm(f => ({ ...f, channel: e.target.value as Channel }))}
              className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Shopee">Shopee</option>
              <option value="TikTok">TikTok</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Khu vực</label>
            <select
              value={form.region}
              onChange={e => setForm(f => ({ ...f, region: e.target.value as Region }))}
              className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="HCM">HCM</option>
              <option value="HN">Hà Nội</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Người phụ trách</label>
            <select
              multiple
              value={form.assignedTo}
              onChange={e => setForm(f => ({ ...f, assignedTo: Array.from(e.target.selectedOptions, o => o.value) }))}
              className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              size={3}
            >
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Giữ Ctrl để chọn nhiều</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Target mặc định/tháng</label>
            <input
              type="number"
              min={0}
              value={form.defaultMonthlyTarget || ''}
              onChange={e => setForm(f => ({ ...f, defaultMonthlyTarget: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2.5 border border-slate-600 rounded-lg text-sm bg-slate-800 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
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
