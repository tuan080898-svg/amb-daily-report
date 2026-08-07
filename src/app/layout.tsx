import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import ClientProviders from "@/components/ClientProviders";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AMB Daily Report",
  description: "Báo cáo doanh số hàng ngày - AMB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-950 font-[family-name:var(--font-geist-sans)]">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
