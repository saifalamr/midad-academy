import type { Metadata } from 'next';
import { Inter, IBM_Plex_Sans_Arabic } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
});

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Midad Academy — مداد',
  description: 'Live Arabic classes for children aged 5–15',
};

// Kept identical to the CSP header in next.config.js so the two policies don't
// intersect into something stricter. 'unsafe-eval' is needed by Fabric.js / Yjs.
const contentSecurityPolicy =
  "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; media-src 'self' https: blob:; connect-src 'self' https: wss:; worker-src 'self' blob:; frame-src 'self' https:;";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${ibmPlexArabic.variable}`}>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={contentSecurityPolicy} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
