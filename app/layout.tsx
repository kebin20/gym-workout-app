import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Liftline Demo — 12-Week Strength Plan',
  description:
    'A mobile-friendly 12-week, 3-day workout tracker for logging sets, reps, RIR, notes, volume, and weekly progress.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'Liftline Demo — 12-Week Strength Plan',
    description: 'Explore a sample 3-day strength routine and 12 weeks of progress.',
    type: 'website',
    images: [{ url: '/og.png', width: 1734, height: 909, alt: 'Liftline 12-week strength plan' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Liftline Demo — 12-Week Strength Plan',
    description: 'Explore a sample 3-day strength routine and 12 weeks of progress.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
