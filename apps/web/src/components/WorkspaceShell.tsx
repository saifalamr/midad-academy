'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import Icon, { type IconName } from './Icon';
import { dashboardPath, useAuth } from './AuthProvider';
export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const path = usePathname();
  const router = useRouter();
  if (!user) return <>{children}</>;
  const dashboard = dashboardPath(user.role);
  const links: { href: string; label: string; icon: IconName }[] = [
    { href: '/', label: 'الرئيسية', icon: 'academy' },
    {
      href: dashboard,
      label:
        user.role === 'ADMIN'
          ? 'إدارة الأكاديمية'
          : user.role === 'PARENT'
            ? 'أبنائي وتقدمهم'
            : 'صفوفي وحصصي',
      icon: 'calendar',
    },
    { href: '/courses', label: 'الدورات', icon: 'book' },
    ...(user.role === 'TEACHER'
      ? [
          { href: '/teacher/reports', label: 'تقارير الحصص', icon: 'edit' as IconName },
          { href: '/teacher/students', label: 'الطلاب', icon: 'graduate' as IconName },
          { href: '/teacher/review-answers', label: 'مراجعة الإجابات', icon: 'edit' as IconName },
        ]
      : []),
    { href: '/account', label: 'حسابي', icon: 'family' },
  ];
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
            onClick={() => {
              logout();
              router.replace('/login');
            }}
          >
            <Icon name="logout" />
          </button>
        </div>
      </header>
      <nav className="workspace-nav" aria-label="تنقل مساحة العمل">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={path === link.href ? 'page' : undefined}
          >
            <Icon name={link.icon} />
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>
      <div className="workspace-content" id="workspace-content">
        {children}
      </div>
    </div>
  );
}
