import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import { preload } from 'react-dom';
import './fonts.css';
import './globals.css';

// Public metadata is deliberately neutral: no description, no og:image, no
// film or event names. Private pages override only the <title>, and only
// members ever receive those pages.
export const metadata: Metadata = {
  title: { default: 'bağlık.society', template: '%s · bağlık.society' },
  applicationName: 'bağlık.society',
  referrer: 'same-origin',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true, 'max-snippet': 0 },
  },
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { title: 'bağlık.society', statusBarStyle: 'black-translucent', capable: true },
  openGraph: { title: 'bağlık.society', type: 'website' },
};

export const viewport: Viewport = {
  themeColor: '#0A0A0C',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Every page renders per request: the CSP nonce (set in proxy.ts) must reach
// each <script>, which a build-time static page could not carry.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  preload('/fonts/cormorant-garamond-latin-500-normal.woff2', {
    as: 'font',
    type: 'font/woff2',
    crossOrigin: '',
  });
  preload('/fonts/inter-latin-400-normal.woff2', {
    as: 'font',
    type: 'font/woff2',
    crossOrigin: '',
  });
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
