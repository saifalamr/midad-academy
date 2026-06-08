'use client';

import { useRouter } from 'next/navigation';

export default function PaymentCancelPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-3">😕</div>
        <h1 className="text-lg font-bold text-gray-900 mb-1">Payment cancelled</h1>
        <p className="text-sm text-gray-500 mb-6">
          No charge was made and you haven&apos;t been enrolled. You can try again whenever you&apos;re ready.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/courses')}
            className="flex-1 py-2.5 rounded-lg bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors"
          >
            Back to courses
          </button>
          <button
            onClick={() => router.push('/student')}
            className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            My dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
