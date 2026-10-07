'use client';
import Link from 'next/link';

export default function Error({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 32, textAlign: 'center' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1B3A6B' }}>Something went wrong</h1>
      <p style={{ color: '#7b8493', fontSize: 14, maxWidth: 400 }}>
        An unexpected error occurred. Please try again, or go back to the homepage.
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => reset()} className="btn btn-gold">Try again</button>
        <Link href="/" className="btn btn-outline">Go home</Link>
      </div>
    </div>
  );
}
