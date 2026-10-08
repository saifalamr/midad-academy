'use client';

import Icon from '@/components/Icon';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

type CurrentUser = { name: string; role: 'TEACHER' | 'STUDENT' | 'PARENT' };

const DASHBOARD_PATH: Record<CurrentUser['role'], string> = {
  TEACHER: '/teacher',
  STUDENT: '/student',
  PARENT: '/parent',
};

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/courses', label: 'Courses' },
  { href: '/#pricing-anchor', label: 'Pricing' },
];


export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();

  const { user, status, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);



  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleLogout() {
    logout();
    setMenuOpen(false);
    setMobileOpen(false);
    router.push('/');
  }

  const dashboardHref = user ? DASHBOARD_PATH[user.role] : '/login';

  return (
    <header className="midad nav">
      <div className="nav-inner">
        <Link className="brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/midad-logo-transparent.png" alt="Midad Academy" className="logo-full" />
        </Link>

        <nav className="nav-links">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} className={pathname === link.href ? 'on' : ''} href={link.href}>
              {link.label}
            </Link>
          ))}
          <Link className={pathname === dashboardHref ? 'on' : ''} href={dashboardHref}>Dashboard</Link>
        </nav>

        <div className="nav-cta">
          {user ? (
            <div className="nav-user" ref={menuRef}>
              <button className="nav-user-btn" aria-expanded={menuOpen} aria-label="قائمة الحساب" onClick={() => setMenuOpen((o) => !o)}>
                <span className="avatar" style={{ width: 34, height: 34 }}>{user.name.charAt(0).toUpperCase()}</span>
                <span className="name">{user.name}</span>
                <Icon name="right" size={14} />
              </button>
              {menuOpen && (
                <div className="nav-user-menu card">
                  <div className="nu-info">
                    <b>{user.name}</b>
                    <span>{user.role.toLowerCase()}</span>
                  </div>
                  <Link href={dashboardHref} onClick={() => setMenuOpen(false)}><Icon name="dashboard" /> My Dashboard</Link>
                  <button className="logout" onClick={handleLogout}><Icon name="logout" /> Log out</button>
                </div>
              )}
            </div>
          ) : status !== 'ready' ? <span role="status">جارٍ تحميل الحساب…</span> : (
            <>
              <Link className="btn btn-sm btn-outline" href="/login">Log in</Link>
              <Link className="btn btn-sm btn-gold" href="/register">Get Started</Link>
            </>
          )}
        </div>

        <button className="nav-burger" aria-label="Toggle menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen((o) => !o)}>
          <span style={{ fontSize: 20 }}>{mobileOpen ? <><Icon name="close" /></> : <><Icon name="menu" /></>}</span>
        </button>
      </div>

      <div className={`nav-mobile${mobileOpen ? ' open' : ''}`}>
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)}>{link.label}</Link>
        ))}
        <Link href={dashboardHref} onClick={() => setMobileOpen(false)}>Dashboard</Link>

        {user ? (
          <button className="logout" onClick={handleLogout}><Icon name="logout" /> Log out ({user.name})</button>
        ) : status !== 'ready' ? <span role="status">جارٍ تحميل الحساب…</span> : (
          <div className="nm-cta">
            <Link className="btn btn-sm btn-outline" href="/login" onClick={() => setMobileOpen(false)}>Log in</Link>
            <Link className="btn btn-sm btn-gold" href="/register" onClick={() => setMobileOpen(false)}>Get Started</Link>
          </div>
        )}
      </div>
    </header>
  );
}
