'use client';

import AppProvider from './AppProvider';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <AppProvider>{children}</AppProvider>;
}
