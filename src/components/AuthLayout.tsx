'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/store';
import Sidebar from './Sidebar';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAppState();
  const router = useRouter();

  useEffect(() => {
    if (!currentUser) {
      router.replace('/login');
    }
  }, [currentUser, router]);

  if (!currentUser) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-slate-950">{children}</main>
    </div>
  );
}
