'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/store';
import { homeFor } from '@/lib/roles';

export default function Home() {
  const { currentUser } = useAppState();
  const router = useRouter();

  useEffect(() => {
    if (currentUser) {
      router.replace(homeFor(currentUser.role));
    } else {
      router.replace('/login');
    }
  }, [currentUser, router]);

  return null;
}
