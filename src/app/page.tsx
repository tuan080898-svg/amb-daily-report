'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/store';

export default function Home() {
  const { currentUser } = useAppState();
  const router = useRouter();

  useEffect(() => {
    if (currentUser) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [currentUser, router]);

  return null;
}
