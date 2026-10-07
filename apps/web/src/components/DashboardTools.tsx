'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';

export default function DashboardTools({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    if (!token) { router.replace('/login'); return; }
    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then(async (res) => {
      if (res.status === 401) { localStorage.removeItem('token'); sessionStorage.removeItem('token'); router.replace('/login'); return; }
      if (!res.ok) throw new Error('Could not load account');
      const { data } = await res.json();
      const role = data.role.toLowerCase();
      const area = path.split('/')[1];
      if (['teacher', 'student', 'parent'].includes(area) && role !== area) { router.replace(`/${role}`); return; }
      if (!cancelled) setStatus('ready');
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [path, router]);
  if (status !== 'ready') return <main className="midad wrap" style={{ padding: 48 }}><h1>{status === 'error' ? 'Could not connect to the academy' : 'Loading your account…'}</h1>{status === 'error' && <button className="btn btn-gold" onClick={() => window.location.reload()}>Try again</button>}</main>;
  return <><div className="midad account-tools"><Link href="/account">Account · الحساب</Link><button onClick={() => { localStorage.removeItem('token'); sessionStorage.removeItem('token'); router.replace('/login'); }}>Log out · خروج</button></div>{children}</>;
}
