'use client';
import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import type { WritingStrokes, WritingPoint } from '@/lib/writing';
import './writing.css';

export default function WritingBoard({
  word,
  fontSize,
  strokes,
  onChange,
  guides = [],
  readOnly = false,
  label = 'لوحة الكتابة',
  demonstrate = false,
}: {
  word: string;
  fontSize: number;
  strokes: WritingStrokes;
  onChange?: (s: WritingStrokes) => void;
  guides?: WritingStrokes;
  readOnly?: boolean;
  label?: string;
  demonstrate?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const active = useRef<{ id: number; points: WritingPoint[] } | null>(null);
  const [current, setCurrent] = useState<WritingPoint[]>([]);
  const [limit, setLimit] = useState('');
  const [play, setPlay] = useState(0);
  const markerId = useId().replace(/:/g, '');
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // A resize never clears vector data. Captured coordinates use one fixed viewBox.
  function point(e: PointerEvent<SVGSVGElement>) {
    const box = svg.current!.getBoundingClientRect();
    return {
      x: Math.round(Math.max(0, Math.min(1000, ((e.clientX - box.left) * 1000) / box.width))),
      y: Math.round(Math.max(0, Math.min(400, ((e.clientY - box.top) * 400) / box.height))),
    };
  }
  function finish(e: PointerEvent<SVGSVGElement>, cancelled = false) {
    if (!active.current || active.current.id !== e.pointerId) return;
    const points = active.current.points;
    active.current = null;
    setCurrent([]);
    if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId);
    if (!cancelled) onChangeRef.current?.([...strokesRef.current, points]);
  }
  useEffect(
    () => () => {
      active.current = null;
    },
    []
  );
  const draw = (paths: WritingStrokes, className: string) =>
    paths.map((s, i) =>
      s.length === 1 ? (
        <circle key={i} cx={s[0].x} cy={s[0].y} r={7} className={className} />
      ) : (
        <polyline key={i} points={s.map((p) => p.x + ',' + p.y).join(' ')} className={className} />
      )
    );
  return (
    <div className="writing-board-wrap">
      <svg
        ref={svg}
        viewBox="0 0 1000 400"
        className={'writing-board' + (readOnly ? ' readonly' : '')}
        role="img"
        aria-label={label}
        onPointerDown={(e) => {
          if (readOnly || !onChange || active.current || e.button !== 0) return;
          if (strokes.length >= 64 || strokes.reduce((n, s) => n + s.length, 0) >= 7744) {
            setLimit('وصلت لحد الحركات؛ تراجع أو امسح بعض الحركات قبل المتابعة');
            return;
          }
          e.preventDefault();
          svg.current!.setPointerCapture(e.pointerId);
          active.current = { id: e.pointerId, points: [point(e)] };
          setCurrent(active.current.points);
          setLimit('');
        }}
        onPointerMove={(e) => {
          if (!active.current || active.current.id !== e.pointerId) return;
          const p = point(e),
            points = active.current.points,
            last = points[points.length - 1];
          if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
          if (points.length >= 256)
            points.splice(0, points.length, ...points.filter((_, i) => i % 2 === 0));
          points.push(p);
          setCurrent([...points]);
        }}
        onPointerUp={(e) => finish(e)}
        onPointerCancel={(e) => finish(e, true)}
        onLostPointerCapture={(e) => {
          if (active.current?.id === e.pointerId) {
            active.current = null;
            setCurrent([]);
          }
        }}
      >
        <defs>
          <marker id={markerId} markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
            <path d="M0,0 L5,3 L0,6" fill="#b7892e" />
          </marker>
        </defs>
        <line x1="25" y1="263" x2="975" y2="263" className="writing-baseline" />
        <text
          x="500"
          y="245"
          textAnchor="middle"
          direction="rtl"
          fontSize={fontSize}
          className="writing-word"
        >
          {word}
        </text>
        {guides.map((s, i) => (
          <g key={i} className="writing-guide">
            {s.length > 1 && (
              <polyline
                points={s.map((p) => p.x + ',' + p.y).join(' ')}
                markerEnd={'url(#' + markerId + ')'}
              />
            )}
            <circle cx={s[0].x} cy={s[0].y} r={15} />
            <text x={s[0].x} y={s[0].y - 24} textAnchor="middle" direction="ltr">
              {i + 1}
            </text>
          </g>
        ))}
        {draw(strokes, 'writing-ink')}
        {current.length ? draw([current], 'writing-ink') : null}
        {play > 0 && (
          <g key={play}>
            {guides.map((s, i) =>
              s.length === 1 ? (
                <circle
                  key={i}
                  cx={s[0].x}
                  cy={s[0].y}
                  r="9"
                  className="writing-demo-dot"
                  style={{ animationDelay: i * 1.2 + 's' }}
                />
              ) : (
                <polyline
                  key={i}
                  pathLength="1"
                  points={s.map((p) => p.x + ',' + p.y).join(' ')}
                  className="writing-demo"
                  style={{ animationDelay: i * 1.2 + 's' }}
                />
              )
            )}
          </g>
        )}
      </svg>
      {limit && <p role="alert">{limit}</p>}
      <div className="writing-tools">
        {!readOnly && (
          <>
            <button
              type="button"
              className="btn btn-outline"
              disabled={!strokes.length}
              onClick={() => onChange?.(strokes.slice(0, -1))}
            >
              تراجع عن آخر حركة
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={!strokes.length}
              onClick={() => onChange?.([])}
            >
              مسح المحاولة
            </button>
          </>
        )}
        {demonstrate && guides.length > 0 && (
          <button type="button" className="btn btn-outline" onClick={() => setPlay((p) => p + 1)}>
            شاهد طريقة الكتابة
          </button>
        )}
      </div>
    </div>
  );
}
