'use client';
import { useState } from 'react';
import { sessionCalendar, type CalendarSession } from '@/lib/calendar';

export default function AddToCalendar({ session }: { session: CalendarSession }) {
  const [error, setError] = useState('');
  function download() {
    try {
      const value = sessionCalendar(session, window.location.origin);
      const url = URL.createObjectURL(new Blob([value], { type: 'text/calendar;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'midad-class.ics';
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setError('');
    } catch { setError('تعذر إضافة الموعد. تحقق من تاريخ الحصة.'); }
  }
  return <div><button className="btn btn-sm btn-outline" type="button" onClick={download} aria-label={`إضافة ${session.title} للتقويم`}>إضافة للتقويم</button>{error && <small role="alert">{error}</small>}</div>;
}
