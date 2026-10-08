'use client';

import Icon from '@/components/Icon';
import { flushSync } from 'react-dom';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Canvas,
  PencilBrush,
  Path as FabricPath,
  Group,
  Text as FabricText,
  Rect,
  Circle as FabricCircle,
  Line as FabricLine,
  util,
  type FabricObject,
  type TPointerEventInfo,
  type TPointerEvent,
} from 'fabric';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { API_URL } from '@/lib/config';

function getWhiteboardWsUrl(): string {
  return process.env.NEXT_PUBLIC_WHITEBOARD_WS_URL || API_URL.replace(/^http/, 'ws').replace(/\/$/, '');
}

export type Tool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'rectangle' | 'circle' | 'line';

export type EraserMode = 'object' | 'partial';

export const PALETTE = ['#1B3A6B', '#C9922A', '#e0483d', '#2f8f5b', '#1c2536', '#ffffff'];

type TextOverlay = {
  canvasX: number; canvasY: number;  // position in Fabric canvas units
  cssX: number;    cssY: number;     // position in CSS px (relative to canvas wrapper)
  color: string;
  fontSizePx: number;                // textarea font-size matched to canvas scale
};

function hexToRgba(hex: string, alpha: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function lockObjects(canvas: Canvas, editable: boolean) {
  canvas.forEachObject((obj: FabricObject) => {
    obj.selectable = editable;
    obj.evented    = editable;
  });
}

export interface WhiteboardHandle {
  clear: () => void;
  undo: () => void;
  redo: () => void;
  exportImage: () => void;
}

interface WhiteboardProps {
  roomId: string;
  canDraw: boolean;
  tool: Tool;
  color: string;
  lineWidth: number;
  eraserMode?: EraserMode;
  eraserSize?: number;
  /** When true, the canvas background is transparent so shared content
   *  rendered behind it remains visible (teacher draws on top of it). */
  overlay?: boolean;
}

const Whiteboard = forwardRef<WhiteboardHandle, WhiteboardProps>(function Whiteboard(
  { roomId, canDraw, tool, color, lineWidth, overlay = false, eraserMode = 'object', eraserSize = 24 },
  ref,
) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const canvasRef   = useRef<Canvas | null>(null);
  const syncNowRef  = useRef<() => void>(() => {});
  const applyingRef = useRef(false);
  const historyRef = useRef<Y.UndoManager | null>(null);
  const clearRef = useRef<() => void>(() => {});
  const wrapperRef = useRef<HTMLDivElement>(null);

  const canDrawRef   = useRef(canDraw);
  canDrawRef.current = canDraw;

  const [connected, setConnected] = useState(false);
  const connectedRef = useRef(false);

  const toolRef  = useRef(tool);
  const colorRef = useRef(color);
  const widthRef = useRef(lineWidth);
  const eraserModeRef = useRef(eraserMode); eraserModeRef.current = eraserMode;
  const eraserSizeRef = useRef(eraserSize); eraserSizeRef.current = eraserSize;
  useEffect(() => { toolRef.current  = tool;      }, [tool]);
  useEffect(() => { colorRef.current = color;     }, [color]);
  useEffect(() => { widthRef.current = lineWidth; }, [lineWidth]);

  // ─── Text overlay ────────────────────────────────────────────────────────────
  const [textOverlay, setTextOverlay] = useState<TextOverlay | null>(null);
  // Ref mirrors so callbacks that close over stale state still see current values.
  const textOverlayRef    = useRef<TextOverlay | null>(null);
  textOverlayRef.current  = textOverlay;
  // Prevents the click that dismisses the textarea from immediately opening a new one.
  const justCommittedRef  = useRef(false);
  const textareaRef       = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textOverlay) textareaRef.current?.focus();
  }, [textOverlay]);

  // Commit: read textarea value, stamp a Fabric.Text object, close overlay.
  // Only uses refs → no deps → stable callback (safe to call from effects).
  const doCommit = useCallback(() => {
    const overlay = textOverlayRef.current;
    if (!overlay) return; // already committed or never opened
    textOverlayRef.current = null;
    setTextOverlay(null);
    justCommittedRef.current = true;
    setTimeout(() => { justCommittedRef.current = false; }, 0);

    const canvas = canvasRef.current;
    const value  = textareaRef.current?.value?.trim() ?? '';
    if (!value || !canvas || !canDrawRef.current || !connectedRef.current) return;

    canvas.add(new FabricText(value, {
      originX: 'left', originY: 'top',
      left:       overlay.canvasX,
      top:        overlay.canvasY,
      fill:       overlay.color,
      fontSize:   40,
      fontFamily: 'Tahoma, Arial, sans-serif',
      direction:  'rtl',
      textAlign:  'right',
    }));
    canvas.requestRenderAll();
    syncNowRef.current();
  }, []);

  // Cancel: discard without creating a Fabric object.
  const doCancel = useCallback(() => {
    textOverlayRef.current = null;
    setTextOverlay(null);
    justCommittedRef.current = true;
    setTimeout(() => { justCommittedRef.current = false; }, 0);
  }, []);

  // Commit when switching away from text tool while overlay is open.
  useEffect(() => {
    if (tool !== 'text') doCommit();
  }, [tool, doCommit]);

  // ─── Mount once per roomId ──────────────────────────────────────────────────
  useEffect(() => {
    const el = canvasElRef.current;
    if (!el) return;

    const canvas = new Canvas(el, {
      enablePointerEvents: true,
      isDrawingMode: false,
      selection:     false,
      backgroundColor: overlay ? 'transparent' : '#ffffff',
    });
    canvasRef.current = canvas;
    lockObjects(canvas, canDrawRef.current);

    // Independent Y.Map entries let two people add strokes concurrently without
    // replacing each other's board. Undo tracks only this participant's edits.
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(getWhiteboardWsUrl(), `whiteboard-${roomId}`, ydoc, {
      params: { token: localStorage.getItem('token') ?? sessionStorage.getItem('token') ?? '' },
      disableBc: true,
      connect: navigator.onLine,
    });
    const state = ydoc.getMap<string>('objects');
    const origin = {};
    const undo = new Y.UndoManager(state, { trackedOrigins: new Set([origin]), captureTimeout: 300 });
    historyRef.current = undo;
    const ids = new WeakMap<FabricObject, string>();
    const applied = new Map<string, string>();
    let disposed = false;
    let rendering: Promise<void> = Promise.resolve();
    const reconcile = () => {
      rendering = rendering.then(async () => {
        if (disposed) return;
        const objects = new Map(canvas.getObjects().map(obj => [ids.get(obj), obj]));
        for (const [id, obj] of objects) {
          if (id && !state.has(id)) { applyingRef.current = true; canvas.remove(obj); applyingRef.current = false; applied.delete(id); }
        }
        const entries = [...state.entries()].sort((a, b) => {
          try { return JSON.parse(a[1]).order - JSON.parse(b[1]).order || a[0].localeCompare(b[0]); } catch { return a[0].localeCompare(b[0]); }
        });
        for (const [id, json] of entries) {
          if (applied.get(id) === json) continue;
          try {
            const { data } = JSON.parse(json);
            const [object] = await util.enlivenObjects<FabricObject>([data]);
            if (disposed || state.get(id) !== json) continue;
            applyingRef.current = true;
            const existing = canvas.getObjects().find(obj => ids.get(obj) === id);
            if (existing) canvas.remove(existing);
            ids.set(object, id); applied.set(id, json);
            object.selectable = canDrawRef.current && connectedRef.current && toolRef.current === 'select'; object.evented = object.selectable;
            canvas.add(object);
            applyingRef.current = false;
          } catch { applyingRef.current = false; }
        }
        entries.forEach(([id], index) => { const obj = canvas.getObjects().find(o => ids.get(o) === id); if (obj) canvas.moveObjectTo(obj, index); });
        canvas.requestRenderAll();
      }).catch(() => { applyingRef.current = false; });
    };
    const writeObject = ({ target }: { target?: FabricObject }) => {
      if (!target || applyingRef.current || !canDrawRef.current || !connectedRef.current) return;
      const id = ids.get(target) ?? crypto.randomUUID(); ids.set(target, id);
      const previous = state.get(id);
      const json = JSON.stringify({ order: previous ? JSON.parse(previous).order : Date.now(), data: target.toObject() });
      applied.set(id, json);
      ydoc.transact(() => state.set(id, json), origin);
    };
    const removeObject = ({ target }: { target?: FabricObject }) => {
      if (!target || applyingRef.current || !canDrawRef.current || !connectedRef.current) return;
      const id = ids.get(target); if (!id) return;
      applied.delete(id); ydoc.transact(() => state.delete(id), origin);
    };
    const modifyObject = ({ target }: { target?: FabricObject }) => {
      if (target?.type === 'activeselection') {
        canvas.discardActiveObject(); canvas.getObjects().forEach(target => writeObject({ target }));
      } else writeObject({ target });
    };
    state.observe(reconcile);
    provider.on('status', ({ status }: { status: string }) => {
      if (status !== 'connected') { connectedRef.current = false; setConnected(false); canvas.isDrawingMode = false; }
    });
    // Mobile browsers can report offline before the socket times out. Freeze
    // edits immediately so unsent ink is never presented as synchronized.
    const offline = () => {
      connectedRef.current = false; setConnected(false);
      canvas.isDrawingMode = false;
      provider.disconnect();
    };
    const online = () => provider.connect();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    provider.on('sync', (ok: boolean) => {
      connectedRef.current = ok; setConnected(ok);
      // Migrate previous single-snapshot documents without discarding saved ink.
      const legacy = ydoc.getMap<string>('state').get('canvas');
      if (ok && canDrawRef.current && !state.size && legacy && !ydoc.getMap('migration').has('objects')) {
        try {
          const data = JSON.parse(legacy);
          ydoc.transact(() => {
            (data.objects ?? []).forEach((object: unknown, i: number) => state.set(`legacy-${i}`, JSON.stringify({ order: i, data: object })));
            ydoc.getMap('migration').set('objects', true);
          }, origin);
          undo.clear();
        } catch { /* Invalid old board must not block a new lesson. */ }
      }
      reconcile();
    });
    syncNowRef.current = () => {};
    clearRef.current = () => { if (canDrawRef.current && connectedRef.current) { undo.stopCapturing(); ydoc.transact(() => [...state.keys()].forEach(id => state.delete(id)), origin); } };
    canvas.on('object:added', writeObject);
    canvas.on('object:modified', modifyObject);
    canvas.on('object:removed', removeObject);

    const resize = () => {
      const rect = wrapperRef.current?.getBoundingClientRect(); if (!rect || disposed) return;
      const scale = Math.min(rect.width / 1000, rect.height / 520);
      canvas.setDimensions({ width: rect.width, height: rect.height });
      canvas.setViewportTransform([scale, 0, 0, scale, (rect.width - 1000 * scale) / 2, (rect.height - 520 * scale) / 2]);
    };
    const observer = new ResizeObserver(resize);
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    resize();
    let erasing = false;
    let erasePoints: { x: number; y: number }[] = [];
    let gestureMode: EraserMode = 'object';
    let radius = 12;
    const previewErase = () => {
      canvas.clearContext(canvas.contextTop);
      const ctx = canvas.contextTop;
      ctx.save(); ctx.transform(...canvas.viewportTransform);
      ctx.strokeStyle = 'rgba(224,72,61,.25)'; ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = radius * 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); erasePoints.forEach((p, i) => { if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.stroke();
      if (erasePoints.length === 1) { const p = erasePoints[0]; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    };
    const erase = (e: TPointerEventInfo<TPointerEvent>) => {
      if (!erasing || toolRef.current !== 'eraser' || !canDrawRef.current || !connectedRef.current) return;
      const p = canvas.getScenePoint(e.e);
      if (gestureMode === 'object') {
        const hit = [...canvas.getObjects()].reverse().find(obj => obj.containsPoint(p));
        if (hit) canvas.remove(hit);
      } else {
        const last = erasePoints.at(-1);
        if (!last || Math.hypot(last.x - p.x, last.y - p.y) >= 1) erasePoints.push({ x: p.x, y: p.y });
        previewErase();
      }
    };
    const endErase = () => {
      if (!erasing) return;
      erasing = false; canvas.clearContext(canvas.contextTop);
      if (gestureMode === 'partial' && erasePoints.length && canDrawRef.current && connectedRef.current) {
        // Filled capsules form a true transparency mask. No white paint is added,
        // and the mask lives in the object's plane so it follows moves/scaling.
        const parts: string[] = [];
        erasePoints.forEach((p, i) => {
          parts.push(`M ${p.x + radius} ${p.y} A ${radius} ${radius} 0 1 0 ${p.x - radius} ${p.y} A ${radius} ${radius} 0 1 0 ${p.x + radius} ${p.y} Z`);
          if (!i) return;
          const previous = erasePoints[i - 1];
          const length = Math.hypot(p.x - previous.x, p.y - previous.y);
          if (!length) return;
          const nx = -(p.y - previous.y) / length * radius, ny = (p.x - previous.x) / length * radius;
          parts.push(`M ${previous.x + nx} ${previous.y + ny} L ${p.x + nx} ${p.y + ny} L ${p.x - nx} ${p.y - ny} L ${previous.x - nx} ${previous.y - ny} Z`);
        });
        const minX = Math.min(...erasePoints.map(p => p.x)) - radius, maxX = Math.max(...erasePoints.map(p => p.x)) + radius;
        const minY = Math.min(...erasePoints.map(p => p.y)) - radius, maxY = Math.max(...erasePoints.map(p => p.y)) + radius;
        ydoc.transact(() => {
          canvas.getObjects().forEach(object => {
            const bounds = object.getBoundingRect();
            if (bounds.left > maxX || bounds.top > maxY || bounds.left + bounds.width < minX || bounds.top + bounds.height < minY) return;
            const mask = new FabricPath(parts.join(' '), { fill: '#000', strokeWidth: 0, inverted: true });
            util.sendObjectToPlane(mask, undefined, object.calcTransformMatrix());
            const old = object.clipPath as FabricObject | undefined;
            if (old?.inverted) {
              // A group of masks is their union; invert the group, not its children.
              old.inverted = false; mask.inverted = false;
              object.set('clipPath', new Group([old, mask], { inverted: true }));
            } else object.set('clipPath', old ? util.mergeClipPaths(old, mask) : mask);
            object.set('dirty', true); writeObject({ target: object });
          });
        }, origin);
        canvas.requestRenderAll();
      }
      erasePoints = []; undo.stopCapturing();
    };
    canvas.on('mouse:move', erase); canvas.on('mouse:up', endErase);

    // ── Shape tools (mouse:down) ──────────────────────────────────────────
    // Cache the Fabric hit-tested target and canvas-space point here so the
    // DOM 'click' handler (which fires after Fabric's own event processing)
    // can use them without re-running hit testing.

    const onMouseDown = (e: TPointerEventInfo<TPointerEvent>) => {
      const p = canvas.getScenePoint(e.e);
      if (!canDrawRef.current || !connectedRef.current) return;
      if (toolRef.current === 'eraser') {
        undo.stopCapturing(); canvas.discardActiveObject(); erasing = true; erasePoints = [];
        gestureMode = eraserModeRef.current; radius = Math.max(2, eraserSizeRef.current) / 2;
        erase(e); return;
      }
      if (toolRef.current === 'text') {
        if (textOverlayRef.current || justCommittedRef.current) return;
        const css = util.transformPoint(p, canvas.viewportTransform);
        const box = wrapperRef.current?.getBoundingClientRect();
        const editor: TextOverlay = {
          canvasX: p.x, canvasY: p.y,
          cssX: Math.max(0, Math.min(css.x, (box?.width ?? 300) - 170)), cssY: css.y,
          color: colorRef.current, fontSizePx: Math.max(16, Math.round(40 * canvas.getZoom())),
        };
        textOverlayRef.current = editor;
        // Safari requires focus in the original touch gesture to open its keyboard.
        flushSync(() => setTextOverlay(editor)); textareaRef.current?.focus();
        return;
      }
      if (e.target) return; // don't stamp shapes on top of existing objects
      const t  = toolRef.current;
      const st = colorRef.current;
      const sw = widthRef.current;

      if (t === 'rectangle')
        canvas.add(new Rect({
          originX: 'left', originY: 'top',
          left: p.x - 60, top: p.y - 40, width: 120, height: 80,
          fill: 'transparent', stroke: st, strokeWidth: sw,
        }));
      else if (t === 'circle')
        canvas.add(new FabricCircle({
          originX: 'left', originY: 'top',
          left: p.x - 50, top: p.y - 50, radius: 50,
          fill: 'transparent', stroke: st, strokeWidth: sw,
        }));
      else if (t === 'line')
        canvas.add(new FabricLine(
          [p.x - 60, p.y, p.x + 60, p.y],
          { originX: 'left', originY: 'top', stroke: st, strokeWidth: sw },
        ));
    };
    canvas.on('mouse:down', onMouseDown);

    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      disposed = true; connectedRef.current = false;
      observer.disconnect();
      canvas.off('mouse:down', onMouseDown);
      canvas.off('mouse:move', erase); canvas.off('mouse:up', endErase);
      canvas.off('object:added', writeObject);
      canvas.off('object:modified', modifyObject);
      canvas.off('object:removed', removeObject);
      state.unobserve(reconcile);
      undo.destroy(); historyRef.current = null;
      provider.destroy();
      ydoc.destroy();
      canvas.dispose();
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ─── overlay (transparent background) toggle ────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.backgroundColor = overlay ? 'transparent' : '#ffffff';
    canvas.requestRenderAll();
  }, [overlay]);

  // ─── canDraw permission changes ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    lockObjects(canvas, canDraw && connected);
    if (!canDraw || !connected) {
      doCancel();
      canvas.isDrawingMode = false;
      canvas.selection     = false;
    }
    canvas.requestRenderAll();
  }, [canDraw, connected, doCancel]);

  // ─── Tool / colour / line-width ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canDraw) return;

    const freehand = tool === 'pen' || tool === 'highlighter';
    canvas.isDrawingMode = freehand && connected;
    canvas.selection = tool === 'select' && connected;
    canvas.discardActiveObject();
    lockObjects(canvas, tool === 'select' && connected);

    if (!freehand) return;
    const brush = new PencilBrush(canvas);
    if (tool === 'pen') {
      brush.color = color;
      brush.width = lineWidth;
    } else if (tool === 'highlighter') {
      brush.color = hexToRgba(color, 0.28);
      brush.width = lineWidth * 5;
    } else {
      brush.color = '#ffffff';
      brush.width = lineWidth * 6;
    }
    canvas.freeDrawingBrush = brush;
  }, [tool, color, lineWidth, canDraw, connected]);

  useImperativeHandle(ref, () => ({
    clear: () => clearRef.current(),
    undo: () => { if (canDrawRef.current && connectedRef.current) historyRef.current?.undo(); },
    redo: () => { if (canDrawRef.current && connectedRef.current) historyRef.current?.redo(); },
    exportImage: () => {
      const canvas = canvasRef.current; if (!canvas) return;
      const link = document.createElement('a'); link.download = `midad-board-${new Date().toISOString().slice(0,10)}.png`;
      link.href = canvas.toDataURL({ format: 'png', multiplier: 2 }); link.click();
    },
  }), []);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvasElRef} width={1000} height={520} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* ── Status badges ── */}
      <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6, zIndex: 5, pointerEvents: 'none' }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'rgba(16,30,52,.7)', color: '#dbe4f1',
            fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
            backdropFilter: 'blur(4px)',
          }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: connected ? '#3fd07d' : '#6f86ab',
          }} />
          {connected ? 'متزامنة' : 'الاتصال منقطع — الرسم متوقف'}
        </span>
        {!canDraw && (
          <span
            style={{
              background: 'rgba(16,30,52,.7)', color: '#dbe4f1',
              fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
              backdropFilter: 'blur(4px)',
            }}
          >
            <Icon name="eye" /> مشاهدة فقط
          </span>
        )}
      </div>

      {textOverlay && (<>
        <div style={{ position: 'absolute', left: textOverlay.cssX, top: Math.max(0, textOverlay.cssY - 36), display: 'flex', gap: 8, zIndex: 21 }}>
          <button type="button" onPointerDown={e => e.preventDefault()} onClick={doCommit} style={{ background: '#1B3A6B', color: '#fff', borderRadius: 6, padding: '4px 12px' }}>تثبيت النص</button>
          <button type="button" onPointerDown={e => e.preventDefault()} onClick={doCancel} style={{ background: '#fff', color: '#1B3A6B', borderRadius: 6, padding: '4px 12px' }}>إلغاء النص</button>
        </div>
        <textarea
          ref={textareaRef}
          aria-label="نص السبورة"
          placeholder="اكتب هنا…"
          rows={1}
          defaultValue=""
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doCommit(); }
            if (e.key === 'Escape') doCancel();
          }}
          onInput={(e) => {
            // Auto-grow height as the user types more lines.
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }}
          onBlur={doCommit}
          style={{
            position:   'absolute',
            left:       textOverlay.cssX,
            top:        textOverlay.cssY,
            color:      textOverlay.color,
            fontSize:   textOverlay.fontSizePx,
            fontFamily: 'Tahoma, Arial, sans-serif',
            direction:  'rtl',
            textAlign:  'right',
            background: 'rgba(255,255,255,.95)',
            border:     '1px dashed #1B3A6B',
            outline:    'none',
            resize:     'none',
            padding:    0,
            margin:     0,
            lineHeight: 1.3,
            minWidth:   140,
            overflow:   'hidden',
            zIndex:     20,
          }}
        />
      </>)}
    </div>
  );
});

export default Whiteboard;
