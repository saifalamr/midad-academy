'use client';
import { useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
export default function ForgotPassword() {
  const [email, setEmail] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  return <main className="midad wrap" style={{ maxWidth: 520, padding: '80px 24px' }}><Link href="/login">← Log in</Link><h1 className="sec-h2">Reset your password</h1><form className="card pad" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { const res = await fetch(`${API_URL}/api/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const data = await res.json(); setMessage(data.message ?? data.error); } catch { setMessage('Could not connect. Please try again.'); } finally { setBusy(false); } }}><label className="field">Your account email<input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><button className="btn btn-gold" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button><p role="status">{message}</p></form></main>;
}
