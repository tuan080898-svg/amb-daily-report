'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/store';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAppState();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (login(email, password)) {
      router.push('/dashboard');
    } else {
      setError('Email hoặc mật khẩu không đúng');
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700/50 p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-100">AMB Daily Report</h1>
            <p className="text-sm text-gray-500 mt-2">Đăng nhập để báo cáo doanh số</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500"
                placeholder="email@amb.com.vn"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500"
                placeholder="••••••"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
            >
              Đăng nhập
            </button>
          </form>

          <div className="mt-6 p-3 bg-slate-800 rounded-lg">
            <p className="text-xs text-gray-500 font-medium mb-2">Tài khoản demo — nhấp để điền:</p>
            <button
              type="button"
              onClick={() => { setEmail('admin@amb.com.vn'); setPassword('admin123'); }}
              className="w-full text-left text-xs text-gray-400 hover:bg-slate-700 hover:text-blue-400 px-2 py-1.5 rounded transition-colors cursor-pointer"
            >
              Admin: admin@amb.com.vn / admin123
            </button>
            <button
              type="button"
              onClick={() => { setEmail('nv1@amb.com.vn'); setPassword('123456'); }}
              className="w-full text-left text-xs text-gray-400 hover:bg-slate-700 hover:text-blue-400 px-2 py-1.5 rounded transition-colors cursor-pointer"
            >
              NV: nv1@amb.com.vn / 123456
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
