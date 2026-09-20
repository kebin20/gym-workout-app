import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://liftline-strength-plan.ktanzyl.chatgpt.site'),
  title: 'Liftline',
  applicationName: 'Liftline',
  manifest: '/manifest-v4.webmanifest',
  description:
    'A strength tracker for logging sets, reps, RIR, notes, volume, and weekly progress across two training phases.',
  icons: {
    icon: [
      { url: '/favicon-v4.png', sizes: '64x64', type: 'image/png' },
      {
        url: '/liftline-icon-192-v4.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/liftline-apple-touch-icon-v4.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    shortcut: '/favicon-v4.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Liftline',
    statusBarStyle: 'default',
  },
  openGraph: {
    title: 'Liftline',
    description:
      'Log every set, follow your 3-day routine, and track progress across two training phases.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1734,
        height: 909,
        alt: 'Liftline strength training dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Liftline',
    description:
      'Log every set, follow your 3-day routine, and track progress across two training phases.',
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
