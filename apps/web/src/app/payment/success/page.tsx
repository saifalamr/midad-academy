'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type ConfirmResult = {
  enrollment: { id: string };
  course: { id: string; title: string; price: number; currency: string };
};

function authFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return fetch(`http://localhost:4000${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

function PaymentSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [status, setStatus] = useState<'confirming' | 'done' | 'error'>('confirming');
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      setError('Missing checkout session — we could not confirm this payment.');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    authFetch('/api/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setStatus('error');
          setError(json.error || 'Could not confirm your payment');
          return;
        }
        setResult(json.data);
        setStatus('done');
      })
      .catch(() => {
        setStatus('error');
        setError('Could not connect to server');
      });
  }, [sessionId, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center">
        {status === 'confirming' && (
          <>
            <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-bold text-gray-900 mb-1">Confirming your payment…</h1>
            <p className="text-sm text-gray-500">This will only take a moment.</p>
          </>
        )}

        {status === 'done' && result && (
          <>
            <div className="text-5xl mb-3">🎉</div>
            <h1 className="text-lg font-bold text-gray-900 mb-1">Payment successful!</h1>
            <p className="text-sm text-gray-500 mb-6">
              You&apos;re enrolled in <span className="font-medium text-gray-700">{result.course.title}</span>.
              {result.course.price > 0 && (
                <> We charged <span className="font-medium text-gray-700">${result.course.price.toFixed(2)} {result.course.currency}</span>.</>
              )}
            </p>
            <button
              onClick={() => router.push('/student')}
              className="w-full py-2.5 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors"
            >
              Go to my dashboard
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-5xl mb-3">⚠️</div>
            <h1 className="text-lg font-bold text-gray-900 mb-1">We couldn&apos;t confirm your payment</h1>
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-6">{error}</p>
            <button
              onClick={() => router.push('/courses')}
              className="w-full py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Back to courses
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense>
      <PaymentSuccessContent />
    </Suspense>
  );
}
