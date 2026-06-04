import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arabic Learning Platform',
  description: 'Live Arabic classes for children aged 5–15',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
