import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Providers from './providers';
import type { Viewport } from 'next';
import ChunkErrorHandler from './components/ChunkErrorHandler';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Dompis',
  description: 'Semangat Pagi Pagi Pagi ...',
  icons: {
    icon: '/assets/logo.webp?v=1',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='id'>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ChunkErrorHandler />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
