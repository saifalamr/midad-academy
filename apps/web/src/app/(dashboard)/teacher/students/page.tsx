'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
type Student = { id: string; name: string; email: string; courseTitle: string; level: string; totalPoints: number };
export default function TeacherStudents() {
  const [students, setStudents] = useState<Student[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { fetch(`${API_URL}/api/teacher/students`, { headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? sessionStorage.getItem('token')}` } }).then(async (res) => { const json = await res.json(); if (!res.ok) throw new Error(json.error); setStudents(json.data); }).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);
  return <main className="midad wrap" style={{ padding: '48px 24px' }}><Link href="/teacher" className="link-gold">← Teacher dashboard</Link><h1 className="sec-h2">Your students · طلابك</h1>{error && <p role="alert" className="auth-error">{error}</p>}{loading ? <p>Loading students…</p> : !students.length ? <p>No enrolled students yet.</p> : <div className="card pad" style={{ overflowX: 'auto' }}><table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}><thead><tr>{['Name', 'Email', 'Course', 'Level', 'XP'].map((h) => <th key={h} style={{ padding: 12 }}>{h}</th>)}</tr></thead><tbody>{students.map((s) => <tr key={s.id}>{[s.name, s.email, s.courseTitle, s.level, s.totalPoints].map((value, i) => <td key={i} style={{ padding: 12, borderTop: '1px solid #ddd' }}>{value}</td>)}</tr>)}</tbody></table></div>}</main>;
}
