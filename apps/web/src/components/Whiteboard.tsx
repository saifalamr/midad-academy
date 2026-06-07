'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Canvas,
  PencilBrush,
  IText,
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

type Tool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'rectangle' | 'circle' | 'line';

const PALETTE = ['#1f2937', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed'];

function hexToRgba(hex: string, alpha: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Students get a live read-only mirror — lock every object so a stray tap
// can't select or move something that just synced in from the teacher.
function lockObjects(canvas: Canvas, unlocked: boolean) {
  canvas.forEachObject((obj: FabricObject) => {
    obj.selectable = unlocked;
    obj.evented = unlocked;
  });
}

interface WhiteboardProps {
  /** LiveKit room id — used to derive the shared Yjs document name. */
  roomId: string;
  /** Teachers can draw; everyone else gets a synced, view-only board. */
  canDraw: boolean;
}

export default function Whiteboard({ roomId, canDraw }: WhiteboardProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const syncNowRef = useRef<() => void>(() => {});
  const applyingRemoteRef = useRef(false);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(PALETTE[0]);
  const [lineWidth, setLineWidth] = useState(3);
  const [connected, setConnected] = useState(false);

  // Mirrors of the toolbar state for the `mouse:down` handler below — that
  // handler is bound once when the canvas mounts, so it reads these refs
  // instead of stale closure values.
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const widthRef = useRef(lineWidth);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { widthRef.current = lineWidth; }, [lineWidth]);

  // ── Mount once: build the Fabric canvas and open the Yjs sync session ────
  useEffect(() => {
    const el = canvasElRef.current;
    if (!el) return;

    const canvas = new Canvas(el, {
      isDrawingMode: canDraw,
      selection: canDraw,
      backgroundColor: '#ffffff',
    });
    canvasRef.current = canvas;
    lockObjects(canvas, canDraw);

    // -- Yjs: every participant in the class opens the same named document
    // (`whiteboard-<roomId>`) against our sync server. We keep things simple
    // by storing the *whole* canvas as one serialized JSON snapshot inside a
    // shared Y.Map — Yjs's CRDT merge then guarantees every client converges
    // on the latest write, even across reconnects, without us having to
    // reconcile individual strokes/shapes ourselves.
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(WS_URL, `whiteboard-${roomId}`, ydoc);
    const state = ydoc.getMap<string>('state');

    provider.on('status', (e: { status: string }) => setConnected(e.status === 'connected'));

    let pushTimer: ReturnType<typeof setTimeout> | undefined;
    const pushSnapshot = () => {
      if (applyingRemoteRef.current) return;
      ydoc.transact(() => state.set('canvas', JSON.stringify(canvas.toJSON())));
    };
    // Exposed so the "Clear board" button can force an immediate sync.
    syncNowRef.current = () => {
      if (pushTimer) clearTimeout(pushTimer);
      pushSnapshot();
    };
    const scheduleSync = () => {
      if (!canDraw) return;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(pushSnapshot, 250);
    };

    // Reload the canvas whenever the shared CRDT state changes — this fires
    // both for our own pushes (harmless no-op re-render) and for updates that
    // arrive from other participants over the WebSocket.
    const applyRemote = () => {
      const json = state.get('canvas');
      if (!json) return;
      applyingRemoteRef.current = true;
      canvas.loadFromJSON(json).then(() => {
        lockObjects(canvas, canDraw);
        canvas.requestRenderAll();
        applyingRemoteRef.current = false;
      });
    };
    state.observe(applyRemote);
    provider.on('sync', (isSynced: boolean) => { if (isSynced) applyRemote(); });

    canvas.on('object:added', scheduleSync);
    canvas.on('object:modified', scheduleSync);
    canvas.on('object:removed', scheduleSync);
    canvas.on('path:created', scheduleSync);

    // -- Click-to-place handler for the text & shape tools (teacher only) --
    const onMouseDown = (e: TPointerEventInfo<TPointerEvent>) => {
      if (!canDraw) return;
      const activeTool = toolRef.current;
      if (!['text', 'rectangle', 'circle', 'line'].includes(activeTool)) return;

      const p = canvas.getScenePoint(e.e);
      const stroke = colorRef.current;
      const width = widthRef.current;

      if (activeTool === 'text') {
        // `direction: 'rtl'` + `textAlign: 'right'` make the box behave
        // naturally for Arabic — the cursor starts on the right and text
        // grows leftward, matching how students/teachers actually type it.
        const text = new IText('اكتب هنا', {
          left: p.x,
          top: p.y,
          fill: stroke,
          fontSize: 22,
          fontFamily: 'Tahoma, Arial, sans-serif',
          direction: 'rtl',
          textAlign: 'right',
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll();
      } else if (activeTool === 'rectangle') {
        canvas.add(new Rect({
          left: p.x - 60, top: p.y - 40, width: 120, height: 80,
          fill: 'transparent', stroke, strokeWidth: width,
        }));
      } else if (activeTool === 'circle') {
        canvas.add(new FabricCircle({
          left: p.x - 50, top: p.y - 50, radius: 50,
          fill: 'transparent', stroke, strokeWidth: width,
        }));
      } else if (activeTool === 'line') {
        canvas.add(new FabricLine([p.x - 60, p.y, p.x + 60, p.y], { stroke, strokeWidth: width }));
      }
    };
    canvas.on('mouse:down', onMouseDown);

    return () => {
      if (pushTimer) clearTimeout(pushTimer);
      canvas.off('mouse:down', onMouseDown);
      canvas.off('object:added', scheduleSync);
      canvas.off('object:modified', scheduleSync);
      canvas.off('object:removed', scheduleSync);
      canvas.off('path:created', scheduleSync);
      state.unobserve(applyRemote);
      provider.destroy();
      ydoc.destroy();
      canvas.dispose();
      canvasRef.current = null;
    };
  }, [roomId, canDraw]);

  // ── Keep the active brush in sync with the selected tool/colour/width ────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canDraw) return;

    const freehand = tool === 'pen' || tool === 'highlighter' || tool === 'eraser';
    canvas.isDrawingMode = freehand;
    canvas.selection = tool === 'select';

    if (freehand) {
      const brush = new PencilBrush(canvas);
      if (tool === 'pen') {
        brush.color = color;
        brush.width = lineWidth;
      } else if (tool === 'highlighter') {
        brush.color = hexToRgba(color, 0.28);
        brush.width = lineWidth * 5;
      } else {
        // Fabric's core build ships no object-level eraser brush — painting
        // in the board's own background colour is the standard lightweight
        // trick for "erasing" on a freehand whiteboard.
        brush.color = '#ffffff';
        brush.width = lineWidth * 6;
      }
      canvas.freeDrawingBrush = brush;
    }
  }, [tool, color, lineWidth, canDraw]);

  const clearBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canDraw) return;
    canvas.clear();
    canvas.backgroundColor = '#ffffff';
    canvas.requestRenderAll();
    syncNowRef.current();
  }, [canDraw]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {canDraw ? (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50">
          <ToolButton active={tool === 'pen'} label="✏️ Pen" onClick={() => setTool('pen')} />
          <ToolButton active={tool === 'highlighter'} label="🖍️ Highlighter" onClick={() => setTool('highlighter')} />
          <ToolButton active={tool === 'eraser'} label="🧽 Eraser" onClick={() => setTool('eraser')} />
          <ToolButton active={tool === 'text'} label="🔤 Text" onClick={() => setTool('text')} />
          <ToolButton active={tool === 'rectangle'} label="▭ Rectangle" onClick={() => setTool('rectangle')} />
          <ToolButton active={tool === 'circle'} label="◯ Circle" onClick={() => setTool('circle')} />
          <ToolButton active={tool === 'line'} label="／ Line" onClick={() => setTool('line')} />
          <ToolButton active={tool === 'select'} label="↖ Select" onClick={() => setTool('select')} />

          <div className="h-6 w-px bg-gray-300 mx-1" />

          <div className="flex items-center gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${
                  color === c ? 'border-primary-600 scale-110' : 'border-gray-300'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-gray-300"
              aria-label="Custom color"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span>Width</span>
            <input
              type="range"
              min={1}
              max={20}
              value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="accent-primary-600"
            />
            <span className="w-5 text-center">{lineWidth}</span>
          </div>

          <button
            onClick={clearBoard}
            className="ml-auto text-xs font-medium text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            Clear board
          </button>

          <span className={`text-xs font-medium ${connected ? 'text-green-600' : 'text-gray-400'}`}>
            ● {connected ? 'Live' : 'Connecting…'}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50">
          <span className="text-xs font-medium text-gray-500">
            👁️ View only — your teacher controls this whiteboard
          </span>
          <span className={`text-xs font-medium ${connected ? 'text-green-600' : 'text-gray-400'}`}>
            ● {connected ? 'Live' : 'Connecting…'}
          </span>
        </div>
      )}

      <div className="bg-white">
        <canvas ref={canvasElRef} width={1000} height={520} className="w-full block" />
      </div>
    </div>
  );
}

function ToolButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
        active
          ? 'bg-primary-600 text-white'
          : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );
}
