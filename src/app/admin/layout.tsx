import AuthLayout from '@/components/AuthLayout';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthLayout>{children}</AuthLayout>;
}
