'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Whiteboard, { PALETTE, type Tool, type EraserMode, type WhiteboardHandle } from '@/components/Whiteboard';
import { API_URL } from '@/lib/config';

const tools: { id: Tool; name: string }[] = [
  { id: 'pen', name: 'قلم' }, { id: 'highlighter', name: 'تظليل' }, { id: 'eraser', name: 'ممحاة' },
  { id: 'text', name: 'نص' }, { id: 'rectangle', name: 'مستطيل' }, { id: 'circle', name: 'دائرة' },
  { id: 'line', name: 'خط' }, { id: 'select', name: 'تحديد' },
];
export default function CourseBoard() {
  const { id } = useParams<{ id: string }>();
  const [access, setAccess] = useState<{ canDraw: boolean } | null>(null);
  const [error, setError] = useState('');
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(PALETTE[0]);
  const [width, setWidth] = useState(3);
  const [eraserMode, setEraserMode] = useState<EraserMode>('object');
  const [eraserSize, setEraserSize] = useState(24);
  const board = useRef<WhiteboardHandle>(null);
  useEffect(() => {
    const controller = new AbortController();
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    if (!token) { setError('سجّل الدخول لفتح سبورة الدورة'); return; }
    fetch(`${API_URL}/api/sessions/state/${id}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async res => { if (!res.ok) throw new Error('لا تملك صلاحية فتح هذه السبورة'); setAccess((await res.json()).data); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [id]);
  return <main className="midad" dir="rtl" style={{ minHeight: '100vh', background: '#101e34', color: '#fff', padding: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <h1 style={{ fontSize: 24 }}>سبورة الدورة</h1><Link className="btn btn-ghost" href={`/courses/${id}/lessons`}>العودة للدروس</Link>
    </div>
    <p>الرسم محفوظ ومتزامن بين المشاركين. يمكنك استخدام السبورة خارج وقت المكالمة.</p>
    {error ? <p role="alert">{error}</p> : !access ? <p>جاري التحقق من الصلاحية…</p> : <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
        {tools.map(item => <button key={item.id} disabled={!access.canDraw} className={`btn ${tool === item.id ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setTool(item.id)}>{item.name}</button>)}
        {tool === 'eraser' && <>
          <select aria-label="نوع الممحاة" value={eraserMode} onChange={e => setEraserMode(e.target.value as EraserMode)} style={{ color: '#101e34' }}>
            <option value="object">حذف الشكل كامل</option><option value="partial">مسح جزء من الشكل</option>
          </select>
          {eraserMode === 'partial' && <label>حجم الممحاة <input aria-label="حجم الممحاة" type="range" min="8" max="100" value={eraserSize} onChange={e => setEraserSize(Number(e.target.value))} /></label>}
        </>}
        <button className="btn btn-ghost" disabled={!access.canDraw} onClick={() => board.current?.undo()}>تراجع</button>
        <button className="btn btn-ghost" disabled={!access.canDraw} onClick={() => board.current?.redo()}>إعادة</button>
        <button className="btn btn-ghost" onClick={() => board.current?.exportImage()}>حفظ صورة</button>
        <button className="btn btn-ghost" disabled={!access.canDraw} onClick={() => { if (confirm('مسح الرسومات؟ يمكنك التراجع بعد المسح.')) board.current?.clear(); }}>مسح</button>
        <select aria-label="لون الرسم" value={color} onChange={e => setColor(e.target.value)}>{PALETTE.map(value => <option key={value}>{value}</option>)}</select>
        <input aria-label="سُمك القلم" type="range" min="1" max="20" value={width} onChange={e => setWidth(Number(e.target.value))} />
      </div>
      <div style={{ position: 'relative', height: '65vh', minHeight: 280, borderRadius: 16, overflow: 'hidden', background: '#fff' }}>
        <Whiteboard ref={board} roomId={id} canDraw={access.canDraw} tool={tool} color={color} lineWidth={width} eraserMode={eraserMode} eraserSize={eraserSize} />
      </div>
    </>}
  </main>;
}
