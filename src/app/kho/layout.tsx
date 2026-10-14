import AuthLayout from '@/components/AuthLayout';

export default function KhoLayout({ children }: { children: React.ReactNode }) {
  return <AuthLayout>{children}</AuthLayout>;
}
