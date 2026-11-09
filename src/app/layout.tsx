import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MathSimple - Asesmen Matematika & Ketelitian Karyawan',
  description: 'Aplikasi tes ketelitian berhitung dasar dan nominal rupiah untuk asesmen karyawan.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
