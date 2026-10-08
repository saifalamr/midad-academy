'use client';
import Icon from '@/components/Icon';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
export default function ResetPassword() {
  const [token, setToken] = useState(''); const [password, setPassword] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get('token') ?? ''); }, []);
  return <main className="midad wrap" style={{ maxWidth: 520, padding: '80px 24px' }}><Link href="/login"><Icon name="left" /> Log in</Link><h1 className="sec-h2">Choose a new password</h1><form className="card pad" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { const res = await fetch(`${API_URL}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) }); const data = await res.json(); setMessage(data.message ?? data.error); if (res.ok) { setDone(true); localStorage.removeItem('token'); sessionStorage.removeItem('token'); } } catch { setMessage('Could not connect. Please try again.'); } finally { setBusy(false); } }}><label className="field">New password<input className="input" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /></label><button className="btn btn-gold" disabled={busy || done || !token}>Update password</button><p role="status">{message}</p>{done && <Link href="/login">Log in with your new password <Icon name="right" /></Link>}</form></main>;
}
