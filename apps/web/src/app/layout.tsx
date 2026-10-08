import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/inter/900.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata: Metadata = {
  title: 'Midad Academy — مداد',
  description: 'Live Arabic classes for children aged 5–15',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" >
      <body className="antialiased"><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
