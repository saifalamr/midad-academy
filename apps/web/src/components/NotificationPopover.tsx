'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { academyApi, localTime, type Notice } from '@/lib/academy-workflow';

export default function NotificationPopover({ userId }: { userId: string }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const unread = notices.filter((notice) => !notice.readAt).length;

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void academyApi<Notice[]>('/academy/notices')
        .then((items) => {
          if (active) {
            setNotices(items);
            setError(false);
          }
        })
        .catch(() => {
          if (active) setError(true);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 45_000);
    window.addEventListener('midad-notices-changed', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('midad-notices-changed', refresh);
    };
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') setOpen(false);
      if (event instanceof MouseEvent && !root.current?.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, [open]);

  async function markRead(id: string) {
    try {
      await academyApi(`/academy/notices/${id}/read`, 'PATCH');
      setNotices((current) =>
        current.map((item) =>
          item.id === id ? { ...item, readAt: new Date().toISOString() } : item
        )
      );
      window.dispatchEvent(new Event('midad-notices-changed'));
    } catch {
      setError(true);
    }
  }

  return (
    <div className="workspace-notification-root" ref={root}>
      <button
        type="button"
        className="workspace-notices"
        aria-label={`الإشعارات${unread ? `، ${unread} غير مقروءة` : ''}`}
        aria-expanded={open}
        aria-controls="workspace-notification-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
        </svg>
        {unread > 0 && (
          <span className="workspace-notice-count">{unread > 99 ? '99+' : unread}</span>
        )}
      </button>
      {open && (
        <section
          id="workspace-notification-panel"
          className="workspace-notification-panel"
          aria-label="آخر الإشعارات"
        >
          <header>
            <h2>الإشعارات</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق الإشعارات">
              ×
            </button>
          </header>
          {error && <p role="alert">تعذر تحديث الإشعارات. حاول مرة أخرى لاحقًا.</p>}
          {!notices.length && !error && (
            <p className="workspace-notice-empty">لا توجد إشعارات الآن.</p>
          )}
          <div className="workspace-notification-list">
            {notices.slice(0, 8).map((item) => (
              <article key={item.id} className={!item.readAt ? 'is-unread' : ''}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <small>{localTime(item.createdAt)}</small>
                <div>
                  <Link href={item.href} onClick={() => setOpen(false)}>
                    فتح التفاصيل
                  </Link>
                  {!item.readAt && (
                    <button type="button" onClick={() => void markRead(item.id)}>
                      تحديد كمقروء
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
