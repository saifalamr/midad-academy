import type { IncomingMessage, Server } from 'http';
import type { FastifyInstance } from 'fastify';
import type { Duplex } from 'node:stream';
import { prisma } from './lib/prisma';
import { canReadClassroom } from './lib/access';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

// Message type tags — must match the wire format the `y-websocket` client
// (`WebsocketProvider`) speaks: 0 = document sync, 1 = awareness (cursors,
// presence, etc). This is the same protocol the official y-websocket server
// used before it was split into a separate package.
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const PING_TIMEOUT = 30_000;

// One Y.Doc per whiteboard "room" (we key rooms by the LiveKit room id, e.g.
// `whiteboard-<roomId>`). Kept in memory — fine for a single API instance;
// would need a persistence/pub-sub layer (e.g. y-redis) to scale horizontally.
interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;
  persist: Promise<unknown>;
  saveTimer?: ReturnType<typeof setTimeout>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

const rooms = new Map<string, Room>();
const loading = new Map<string, Promise<Room>>();
const permissions = new Map<string, Set<string>>();
export function setDrawingPermission(courseId: string, userId: string, allowed: boolean) {
  const grants = permissions.get(courseId) ?? new Set<string>();
  if (allowed) grants.add(userId); else grants.delete(userId);
  permissions.set(courseId, grants);
}

function saveRoom(roomName: string, room: Room) {
  const state = Buffer.from(Y.encodeStateAsUpdate(room.doc));
  room.persist = room.persist.then(() => prisma.whiteboardDocument.upsert({ where: { courseId: roomName.replace(/^whiteboard-/, '') }, create: { courseId: roomName.replace(/^whiteboard-/, ''), state }, update: { state } })).catch((err) => { console.error('Whiteboard save failed:', err.message); });
}

async function getRoom(roomName: string): Promise<Room> {
  if (loading.has(roomName)) return loading.get(roomName)!;
  const promise = loadRoom(roomName);
  loading.set(roomName, promise);
  try { return await promise; } finally { loading.delete(roomName); }
}

async function loadRoom(roomName: string): Promise<Room> {
  let room = rooms.get(roomName);
  if (room) return room;

  const doc = new Y.Doc();
  const saved = await prisma.whiteboardDocument.findUnique({ where: { courseId: roomName.replace(/^whiteboard-/, '') } });
  if (saved) Y.applyUpdate(doc, saved.state);
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);
  const conns = new Map<WebSocket, Set<number>>();
  room = { doc, awareness, conns, persist: Promise.resolve() };
  rooms.set(roomName, room);

  // Whenever the shared document changes (a teacher draws something), encode
  // it as a sync update and broadcast it to every connected participant.
  doc.on('update', (update: Uint8Array) => {
    clearTimeout(room!.saveTimer);
    room!.saveTimer = setTimeout(() => saveRoom(roomName, room!), 500);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    broadcast(room!, encoding.toUint8Array(encoder));
  });

  // Awareness changes (who's connected, cursor positions, etc) get broadcast
  // the same way, scoped to the clients that actually changed.
  awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, conn: WebSocket | null) => {
    const changedClients = added.concat(updated, removed);
    if (conn !== null) {
      const controlled = room!.conns.get(conn);
      if (controlled) {
        added.forEach((id) => controlled.add(id));
        removed.forEach((id) => controlled.delete(id));
      }
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
    broadcast(room!, encoding.toUint8Array(encoder));
  });

  return room;
}

function broadcast(room: Room, message: Uint8Array) {
  room.conns.forEach((_, conn) => send(room, conn, message));
}

function send(room: Room, conn: WebSocket, message: Uint8Array) {
  if (conn.readyState !== WebSocket.CONNECTING && conn.readyState !== WebSocket.OPEN) {
    closeConn(room, conn);
    return;
  }
  try {
    conn.send(message, (err) => { if (err) closeConn(room, conn); });
  } catch {
    closeConn(room, conn);
  }
}

function closeConn(room: Room, conn: WebSocket) {
  const controlled = room.conns.get(conn);
  if (controlled) {
    room.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(controlled), null);
  }
  conn.close();
}

function handleMessage(room: Room, conn: WebSocket, message: Uint8Array) {
  const encoder = encoding.createEncoder();
  const decoder = decoding.createDecoder(message);
  const type = decoding.readVarUint(decoder);

  switch (type) {
    case MESSAGE_SYNC:
      // `readSyncMessage` mutates `room.doc` to apply the incoming update and
      // writes a reply (sync step 2 / further updates) into `encoder` if the
      // sender's state differs from ours.
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, room.doc, conn);
      if (encoding.length(encoder) > 1) send(room, conn, encoding.toUint8Array(encoder));
      break;
    case MESSAGE_AWARENESS:
      awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn);
      break;
  }
}

async function setupConnection(conn: WebSocket, req: IncomingMessage, actor: { id: string; role: string }) {
  // The y-websocket client connects to `<server>/<roomName>` — pull the room
  // name straight out of the path.
  const roomName = decodeURIComponent((req.url ?? '/').slice(1).split('?')[0]) || 'default';
  const courseId = roomName.replace(/^whiteboard-/, '');
  const stored = await prisma.drawingPermission.findUnique({ where: { courseId_userId: { courseId, userId: actor.id } } });
  if (actor.role !== 'TEACHER') setDrawingPermission(courseId, actor.id, actor.role === 'STUDENT' && !!stored);
  const room = await getRoom(roomName);
  clearTimeout(room.cleanupTimer);

  conn.binaryType = 'arraybuffer';
  room.conns.set(conn, new Set());

  conn.on('message', (data: ArrayBuffer) => {
    try {
      const bytes = new Uint8Array(data);
      const decoder = decoding.createDecoder(bytes);
      const kind = decoding.readVarUint(decoder);
      if (actor.role === 'PARENT') {
        if (kind !== MESSAGE_SYNC || decoding.readVarUint(decoder) !== syncProtocol.messageYjsSyncStep1) return;
        handleMessage(room, conn, bytes);
        return;
      }
      if (kind === MESSAGE_SYNC && decoding.readVarUint(decoder) !== syncProtocol.messageYjsSyncStep1 && actor.role !== 'TEACHER' && !permissions.get(roomName.replace(/^whiteboard-/, ''))?.has(actor.id)) return;
      handleMessage(room, conn, bytes);
    } catch { conn.close(1003, 'Invalid message'); }
  });
  conn.on('close', () => {
    closeConn(room, conn);
    if (!room.conns.size) {
      clearTimeout(room.saveTimer); saveRoom(roomName, room);
      room.cleanupTimer = setTimeout(() => { if (!room.conns.size) { room.doc.destroy(); room.awareness.destroy(); rooms.delete(roomName); permissions.delete(roomName.replace(/^whiteboard-/, '')); } }, 60_000);
    }
  });

  // Heartbeat — drop connections that stop responding to pings so `room.conns`
  // doesn't accumulate dead sockets.
  let alive = true;
  conn.on('pong', () => { alive = true; });
  const heartbeat = setInterval(() => {
    if (!alive) {
      clearInterval(heartbeat);
      closeConn(room, conn);
      return;
    }
    alive = false;
    try { conn.ping(); } catch { closeConn(room, conn); }
  }, PING_TIMEOUT);
  conn.on('close', () => clearInterval(heartbeat));

  // Kick off the sync handshake: send our current document state ("sync step
  // 1"). The client compares it with its own and replies with whatever we're
  // missing, so newcomers immediately catch up to the live whiteboard.
  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(syncEncoder, room.doc);
  send(room, conn, encoding.toUint8Array(syncEncoder));

  // Loading the persisted board is asynchronous. A browser may send its first
  // sync request before the connection handler is ready; send a full step 2 as
  // well so every new participant can complete synchronization immediately.
  const initialState = encoding.createEncoder();
  encoding.writeVarUint(initialState, MESSAGE_SYNC);
  syncProtocol.writeSyncStep2(initialState, room.doc);
  send(room, conn, encoding.toUint8Array(initialState));

  // Also send everyone's current awareness state (who else is in the room).
  const states = room.awareness.getStates();
  if (states.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())),
    );
    send(room, conn, encoding.toUint8Array(awarenessEncoder));
  }
}

// Attach the Yjs sync server to the existing HTTP server so it shares the same
// port (and, in production, the same TLS termination) as the REST API. The `ws`
// library handles the HTTP `upgrade` handshake on this server for us. WebSocket
// upgrade requests on any path are routed here; the room name is parsed from the
// path inside `setupConnection`.
export function startWhiteboardWebSocketServer(server: Server, app: FastifyInstance) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  const upgrade = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const roomName = url.pathname.slice(1);
      if (!/^whiteboard-[a-zA-Z0-9_-]+$/.test(roomName)) throw new Error('Invalid room');
      const actor = app.jwt.verify<{ id: string; role: string; version?: number }>(url.searchParams.get('token') ?? '');
      const user = await prisma.user.findUnique({ where: { id: actor.id } });
      if (!user || user.role !== actor.role || user.tokenVersion !== (actor.version ?? 0) || !await canReadClassroom(actor, roomName.replace(/^whiteboard-/, ''))) throw new Error('Forbidden');
      wss.handleUpgrade(req, socket, head, (conn) => {
        void setupConnection(conn, req, actor).catch(() => conn.close(1011, 'Unable to load whiteboard'));
        const expiry = setTimeout(() => conn.close(1008, 'Please reconnect'), 60 * 60_000);
        conn.on('close', () => clearTimeout(expiry));
      });
    } catch { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); }
  };
  server.on('upgrade', upgrade);
  return { async close() {
    server.off('upgrade', upgrade);
    for (const [name, room] of rooms) {
      clearTimeout(room.saveTimer); clearTimeout(room.cleanupTimer); saveRoom(name, room);
      for (const conn of room.conns.keys()) conn.terminate();
      await room.persist; clearTimeout(room.cleanupTimer); room.awareness.destroy(); room.doc.destroy();
    }
    rooms.clear(); permissions.clear();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  } };
}
