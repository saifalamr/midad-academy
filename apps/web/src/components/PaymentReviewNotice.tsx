'use client';
import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/config';
type Review = { id: string; amount: number; currency: string; providerPaymentId: string; course: { title: string }; user: { name: string; email: string } };
export default function PaymentReviewNotice() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/teacher/payment-reviews`, { signal: controller.signal, headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? sessionStorage.getItem('token')}` } })
      .then(async res => { if (!res.ok) throw new Error('تعذر التحقق من المدفوعات التي تحتاج مراجعة.'); const json = await res.json(); setReviews(json.data); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, []);
  if (error) return <p role="alert" className="auth-error">{error}</p>;
  if (!reviews.length) return null;
  return <aside className="card pad" style={{ marginBottom: 20, borderColor: '#d97706' }} dir="rtl" aria-label="مدفوعات تحتاج مراجعة">
    <h2 style={{ fontSize: 20 }}>مدفوعات تحتاج مراجعتك · {reviews.length}</h2>
    <p>تم تسجيل الدفع، لكن التسجيل لم يكتمل. راجع الطلب في Stripe وتواصل مع الطالب لإتمام التسجيل أو معالجة الاسترداد. هذه القائمة لا تُجري استردادًا تلقائيًا.</p>
    <ul>{reviews.map(review => <li key={review.id} style={{ marginTop: 12, overflowWrap: 'anywhere' }}><b>{review.user.name}</b> · {review.course.title} · {review.amount} {review.currency}<br />{review.user.email}<br /><code dir="ltr">{review.providerPaymentId}</code></li>)}</ul>
  </aside>;
}
