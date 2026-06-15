'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Canvas,
  PencilBrush,
  Text as FabricText,
  Rect,
  Circle as FabricCircle,
  Line as FabricLine,
  type FabricObject,
  type TPointerEventInfo,
  type TPointerEvent,
} from 'fabric';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const WS_URL = process.env.NEXT_PUBLIC_WHITEBOARD_WS_URL || 'ws://localhost:1234';

export type Tool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'rectangle' | 'circle' | 'line';

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
}

interface WhiteboardProps {
  roomId: string;
  canDraw: boolean;
  tool: Tool;
  color: string;
  lineWidth: number;
  /** When true, the canvas background is transparent so shared content
   *  rendered behind it remains visible (teacher draws on top of it). */
  overlay?: boolean;
}

const Whiteboard = forwardRef<WhiteboardHandle, WhiteboardProps>(function Whiteboard(
  { roomId, canDraw, tool, color, lineWidth, overlay = false },
  ref,
) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const canvasRef   = useRef<Canvas | null>(null);
  const syncNowRef  = useRef<() => void>(() => {});
  const applyingRef = useRef(false);

  const canDrawRef   = useRef(canDraw);
  canDrawRef.current = canDraw;

  const [connected, setConnected] = useState(false);

  const toolRef  = useRef(tool);
  const colorRef = useRef(color);
  const widthRef = useRef(lineWidth);
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
    if (!value || !canvas) return;

    canvas.add(new FabricText(value, {
      left:       overlay.canvasX,
      top:        overlay.canvasY,
      fill:       overlay.color,
      fontSize:   22,
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
      isDrawingMode: false,
      selection:     false,
      backgroundColor: overlay ? 'transparent' : '#ffffff',
    });
    canvasRef.current = canvas;
    lockObjects(canvas, canDrawRef.current);

    // ── Yjs sync ────────────────────────────────────────────────────────────
    const ydoc     = new Y.Doc();
    const provider = new WebsocketProvider(WS_URL, `whiteboard-${roomId}`, ydoc);
    const state    = ydoc.getMap<string>('state');

    provider.on('status', ({ status }: { status: string }) =>
      setConnected(status === 'connected'),
    );

    let pushTimer: ReturnType<typeof setTimeout> | undefined;

    const pushSnapshot = () => {
      if (applyingRef.current) return;
      ydoc.transact(() => state.set('canvas', JSON.stringify(canvas.toJSON())));
    };

    syncNowRef.current = () => {
      clearTimeout(pushTimer);
      pushSnapshot();
    };

    const scheduleSync = () => {
      if (!canDrawRef.current) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(pushSnapshot, 300);
    };

    const applyRemote = () => {
      const json = state.get('canvas');
      if (!json) return;
      applyingRef.current = true;
      canvas.loadFromJSON(json).then(() => {
        lockObjects(canvas, canDrawRef.current);
        canvas.requestRenderAll();
        applyingRef.current = false;
      });
    };

    state.observe(applyRemote);
    provider.on('sync', (ok: boolean) => { if (ok) applyRemote(); });

    canvas.on('object:added',    scheduleSync);
    canvas.on('object:modified', scheduleSync);
    canvas.on('object:removed',  scheduleSync);
    canvas.on('path:created',    scheduleSync);

    // ── Shape tools (mouse:down) ──────────────────────────────────────────
    // Cache the Fabric hit-tested target and canvas-space point here so the
    // DOM 'click' handler (which fires after Fabric's own event processing)
    // can use them without re-running hit testing.
    let lastDownTarget: FabricObject | null = null;
    let lastDownCanvas = { x: 0, y: 0 };
    let lastDownCss    = { x: 0, y: 0 };

    const onMouseDown = (e: TPointerEventInfo<TPointerEvent>) => {
      lastDownTarget = e.target ?? null;
      const p = canvas.getScenePoint(e.e);
      lastDownCanvas = { x: p.x, y: p.y };
      // offsetX/Y: CSS pixels relative to the canvas element (== relative to
      // the wrapper div since the canvas fills it without offset).
      const me = e.e as { offsetX: number; offsetY: number };
      lastDownCss = { x: me.offsetX ?? 0, y: me.offsetY ?? 0 };

      if (!canDrawRef.current) return;
      if (e.target) return; // don't stamp shapes on top of existing objects
      const t  = toolRef.current;
      const st = colorRef.current;
      const sw = widthRef.current;

      if (t === 'rectangle')
        canvas.add(new Rect({
          left: p.x - 60, top: p.y - 40, width: 120, height: 80,
          fill: 'transparent', stroke: st, strokeWidth: sw,
        }));
      else if (t === 'circle')
        canvas.add(new FabricCircle({
          left: p.x - 50, top: p.y - 50, radius: 50,
          fill: 'transparent', stroke: st, strokeWidth: sw,
        }));
      else if (t === 'line')
        canvas.add(new FabricLine(
          [p.x - 60, p.y, p.x + 60, p.y],
          { stroke: st, strokeWidth: sw },
        ));
    };
    canvas.on('mouse:down', onMouseDown);

    // ── Text tool: DOM 'click' opens the HTML overlay textarea ────────────
    //
    // We deliberately use the native 'click' event rather than any Fabric
    // canvas event.  Fabric's _onMouseUp calls discardActiveObject() on every
    // click that started on empty canvas — any IText.enterEditing() call made
    // inside a Fabric event handler is cancelled by that.  The DOM 'click'
    // event fires *after* the entire mousedown→mouseup cycle has settled, so
    // there is nothing left to fight against.
    const onCanvasClick = () => {
      if (!canDrawRef.current) return;
      if (toolRef.current !== 'text') return;
      if (lastDownTarget) return;        // clicked an existing object
      if (justCommittedRef.current) return; // this is the click that blurred a textarea

      const cssScale   = el.getBoundingClientRect().width / 1000;
      const overlay: TextOverlay = {
        canvasX:    lastDownCanvas.x,
        canvasY:    lastDownCanvas.y,
        cssX:       lastDownCss.x,
        cssY:       lastDownCss.y,
        color:      colorRef.current,
        fontSizePx: Math.round(22 * cssScale),
      };
      textOverlayRef.current = overlay;
      setTextOverlay(overlay);
    };
    el.addEventListener('click', onCanvasClick);

    return () => {
      clearTimeout(pushTimer);
      canvas.off('mouse:down',    onMouseDown);
      el.removeEventListener('click', onCanvasClick);
      canvas.off('object:added',    scheduleSync);
      canvas.off('object:modified', scheduleSync);
      canvas.off('object:removed',  scheduleSync);
      canvas.off('path:created',    scheduleSync);
      state.unobserve(applyRemote);
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
    lockObjects(canvas, canDraw);
    if (!canDraw) {
      canvas.isDrawingMode = false;
      canvas.selection     = false;
    }
    canvas.requestRenderAll();
  }, [canDraw]);

  // ─── Tool / colour / line-width ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canDraw) return;

    const freehand = tool === 'pen' || tool === 'highlighter' || tool === 'eraser';
    canvas.isDrawingMode = freehand;
    canvas.selection     = tool === 'select';

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
  }, [tool, color, lineWidth, canDraw]);

  // ─── Clear board ─────────────────────────────────────────────────────────────
  const clearBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canDrawRef.current) return;
    canvas.clear();
    canvas.backgroundColor = overlay ? 'transparent' : '#ffffff';
    canvas.requestRenderAll();
    syncNowRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay]);

  useImperativeHandle(ref, () => ({ clear: clearBoard }), [clearBoard]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
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
          {connected ? 'Live' : 'Connecting…'}
        </span>
        {!canDraw && (
          <span
            style={{
              background: 'rgba(16,30,52,.7)', color: '#dbe4f1',
              fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
              backdropFilter: 'blur(4px)',
            }}
          >
            👁️ View only
          </span>
        )}
      </div>

      {textOverlay && (
        <textarea
          ref={textareaRef}
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
            background: 'transparent',
            border:     'none',
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
      )}
    </div>
  );
});

export default Whiteboard;
