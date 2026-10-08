'use client';
import Icon from '@/components/Icon';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/config';

export default function AccountPage() {
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [linkCode, setLinkCode] = useState('');
  const [busy, setBusy] = useState(false);
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? sessionStorage.getItem('token')}` });
  useEffect(() => { fetch(`${API_URL}/api/auth/me`, { headers: headers() }).then((r) => r.json()).then(({ data }) => { setUser(data); setName(data.name); }).catch(() => setMessage('Could not load your account')); }, []);
  return <div className="midad"><main className="wrap" style={{ maxWidth: 720, padding: '64px 24px' }}><Link href={user ? `/${user.role.toLowerCase()}` : '/'} className="link-gold"><Icon name="left" /> Dashboard</Link><h1 className="sec-h2">Your account · حسابك</h1>
    <form className="card pad" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setMessage(''); try { const res = await fetch(`${API_URL}/api/account/profile`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ name }) }); const data = await res.json(); setMessage(res.ok ? 'Your name has been updated.' : data.error); } catch { setMessage('Could not connect'); } finally { setBusy(false); } }}>
      <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} /></label><p>{user?.email}</p><button className="btn btn-gold" disabled={busy}>Save changes</button><p role="status">{message}</p>
    </form>
    {user?.role === 'STUDENT' && <section className="card pad" style={{ marginTop: 24 }}><h2>Connect your parent</h2><p>Generate a code and share it with your parent together with your account email. The code expires in 30 minutes and can be used once.</p><button className="btn btn-outline" disabled={busy} onClick={async () => { setBusy(true); try { const res = await fetch(`${API_URL}/api/account/parent-link-code`, { method: 'POST', headers: headers(), body: '{}' }); const data = await res.json(); if (!res.ok) throw new Error(data.error); setLinkCode(data.data.linkCode); } catch { setMessage('Could not generate a code'); } finally { setBusy(false); } }}>Generate linking code</button>{linkCode && <p><code style={{ fontSize: 22, overflowWrap: 'anywhere' }}>{linkCode}</code></p>}</section>}
  </main></div>;
}
