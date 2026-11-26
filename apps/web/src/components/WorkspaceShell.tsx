'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import Icon, { type IconName } from './Icon';
import { dashboardPath, useAuth } from './AuthProvider';
import { academyApi, type Notice } from '@/lib/academy-workflow';
export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const userId = user?.id;
  const userRole = user?.role;
  const [noticeState, setNoticeState] = useState({ userId: '', count: 0 });
  const unreadNotices = noticeState.userId === userId ? noticeState.count : 0;
  useEffect(() => {
    if (!userId || !userRole || !['ADMIN', 'PARENT'].includes(userRole)) return;
    let active = true;
    const refresh = () => {
      void academyApi<Notice[]>('/academy/notices')
        .then((notices) => {
          if (active) setNoticeState({ userId, count: notices.filter((notice) => !notice.readAt).length });
        })
        .catch(() => { /* Keep the last count until connectivity returns. */ });
    };
    refresh();
    const timer = window.setInterval(refresh, 45_000);
    window.addEventListener('midad-notices-changed', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('midad-notices-changed', refresh);
    };
  }, [userId, userRole, path]);
  if (!user) return <>{children}</>;
  const dashboard = dashboardPath(user.role);
  const links: { href: string; label: string; icon: IconName }[] = [
    { href: '/', label: 'الرئيسية', icon: 'academy' },
    {
      href: dashboard,
      label:
        user.role === 'ADMIN'
          ? 'الإدارة'
          : user.role === 'PARENT'
            ? 'أبنائي'
            : user.role === 'TEACHER'
              ? 'حصصي'
              : 'تعلمي',
      icon: 'calendar',
    },
    {
      href: '/academy',
      label: user.role === 'ADMIN' ? 'الطلبات والمتابعة' : 'التسجيل والمتابعة',
      icon: 'family',
    },
    { href: '/courses', label: 'الدورات', icon: 'book' },
    ...(user.role !== 'ADMIN'
      ? [
          {
            href: `/${user.role.toLowerCase()}/homework`,
            label:
              user.role === 'TEACHER'
                ? 'تصحيح الواجبات'
                : user.role === 'PARENT'
                  ? 'واجبات أبنائي'
                  : 'واجباتي',
            icon: 'edit' as IconName,
          },
        ]
      : []),
    ...(user.role === 'TEACHER'
      ? [
          { href: '/teacher/reports', label: 'تقارير الحصص', icon: 'edit' as IconName },
          { href: '/teacher/students', label: 'الطلاب', icon: 'graduate' as IconName },
          { href: '/teacher/review-answers', label: 'مراجعة الإجابات', icon: 'edit' as IconName },
        ]
      : []),
    ...(user.role === 'ADMIN' || user.role === 'PARENT'
      ? [
          {
            href: `/${user.role.toLowerCase()}/notifications`,
            label: user.role === 'ADMIN' ? 'سجل الرسائل' : 'رسائل واتساب',
            icon: 'calendar' as IconName,
          },
        ]
      : []),
    { href: '/account', label: 'حسابي', icon: 'family' },
  ];
  const mainPaths = [
    '/',
    dashboard,
    user.role === 'TEACHER'
      ? '/teacher/homework'
      : user.role === 'STUDENT'
        ? '/courses'
        : '/academy',
  ];
  const mainLinks = links.filter((link) => mainPaths.includes(link.href));
  const otherLinks = links.filter((link) => !mainPaths.includes(link.href));
  return (
    <div className="midad workspace-shell">
      <a className="workspace-skip" href="#workspace-content">
        انتقل إلى المحتوى
      </a>
      <header className="workspace-topbar">
        <Link href="/" className="workspace-brand">
          <Image src="/midad-logo-transparent.png" width={52} height={42} alt="شعار مداد" />
          <b>
            Midad <span>مداد</span>
          </b>
        </Link>
        <div className="workspace-account">
          {(user.role === 'ADMIN' || user.role === 'PARENT') && (
            <Link href="/academy?view=notices" className="workspace-notices" onClick={() => window.dispatchEvent(new Event('midad-open-notices'))} aria-label={`الإشعارات${unreadNotices ? `، ${unreadNotices} غير مقروءة` : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg>
              {unreadNotices > 0 && <span className="workspace-notice-count">{unreadNotices > 99 ? '99+' : unreadNotices}</span>}
            </Link>
          )}
          <span className="workspace-role">
            {user.role === 'ADMIN'
              ? 'الإدارة'
              : user.role === 'TEACHER'
                ? 'المعلّم'
                : user.role === 'PARENT'
                  ? 'ولي الأمر'
                  : 'الطالب'}
          </span>
          <Link href="/account" className="workspace-profile" aria-label="حسابي">
            <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
            <span>{user.name}</span>
          </Link>
          <button
            className="workspace-logout"
            aria-label="Log out · خروج"
            onClick={async () => {
              if (!(await logout())) return;
              router.replace('/login');
            }}
          >
            <Icon name="logout" />
          </button>
        </div>
      </header>
      <nav className="workspace-nav" aria-label="تنقل مساحة العمل">
        {mainLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={path === link.href ? 'page' : undefined}
          >
            <Icon name={link.icon} />
            <span>{link.label}</span>
          </Link>
        ))}
        <details className="workspace-more" key={`${user.role}:${path}`}>
          <summary
            aria-label="المزيد من الصفحات"
            aria-current={otherLinks.some((link) => path === link.href) ? 'page' : undefined}
          >
            <Icon name="family" />
            <span>المزيد</span>
          </summary>
          <div className="workspace-more-links">
            {otherLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={path === link.href ? 'page' : undefined}
              >
                <Icon name={link.icon} />
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        </details>
      </nav>
      <div className="workspace-content" id="workspace-content">
        {children}
      </div>
    </div>
  );
}
