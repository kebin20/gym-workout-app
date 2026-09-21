import type { Metadata } from 'next';
import {
  appRelease,
  appleTouchIconHref,
  installManifestHref,
  withArtworkRevision,
} from './app-release';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://liftline-strength-plan.ktanzyl.chatgpt.site'),
  title: 'Liftline',
  applicationName: 'Liftline',
  description:
    'A strength tracker for logging sets, reps, RIR, notes, volume, and weekly progress across two training phases.',
  icons: {
    icon: [
      {
        url: withArtworkRevision(appRelease.faviconSvgPath),
        type: 'image/svg+xml',
      },
      {
        url: withArtworkRevision(appRelease.favicon32Path),
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: withArtworkRevision(appRelease.favicon64Path),
        sizes: '64x64',
        type: 'image/png',
      },
    ],
    shortcut: withArtworkRevision(appRelease.favicon32Path),
  },
  appleWebApp: {
    capable: true,
    title: 'Liftline',
    statusBarStyle: 'default',
  },
  other: {
    'mobile-web-app-capable': 'yes',
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
      <head>
        <link
          rel="manifest"
          href={installManifestHref}
          crossOrigin="use-credentials"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          type="image/png"
          href={appleTouchIconHref}
        />
        <link
          rel="apple-touch-icon-precomposed"
          sizes="180x180"
          type="image/png"
          href={appleTouchIconHref}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
