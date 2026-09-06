import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const publicIconOrigin =
  'https://raw.githubusercontent.com/kebin20/gym-workout-app/62c99c0864196e7f05409f47633a79132c185675/public';

export const metadata: Metadata = {
  metadataBase: new URL('https://liftline-strength-plan.ktanzyl.chatgpt.site'),
  title: 'Liftline',
  applicationName: 'Liftline',
  manifest: '/manifest-v2.webmanifest',
  description:
    'A mobile-friendly 12-week, 3-day workout tracker for logging sets, reps, RIR, notes, volume, and weekly progress.',
  icons: {
    icon: [
      { url: '/favicon-v2.svg', type: 'image/svg+xml' },
      {
        url: `${publicIconOrigin}/liftline-icon-192-v2.png`,
        sizes: '192x192',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: `${publicIconOrigin}/liftline-apple-touch-icon-v2.png`,
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    shortcut: '/favicon-v2.svg',
  },
  appleWebApp: {
    capable: true,
    title: 'Liftline',
    statusBarStyle: 'default',
  },
  openGraph: {
    title: 'Liftline',
    description:
      'Log every set, follow your 3-day routine, and see 12 weeks of progress.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1734,
        height: 909,
        alt: 'Liftline 12-week strength plan',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Liftline',
    description:
      'Log every set, follow your 3-day routine, and see 12 weeks of progress.',
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
      <body className={`${geistSans.variable} antialiased`}>{children}</body>
    </html>
  );
}
