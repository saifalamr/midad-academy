import type { IncomingMessage } from 'http';
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
}

const rooms = new Map<string, Room>();

function getRoom(roomName: string): Room {
  let room = rooms.get(roomName);
  if (room) return room;

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);
  const conns = new Map<WebSocket, Set<number>>();
  room = { doc, awareness, conns };
  rooms.set(roomName, room);

  // Whenever the shared document changes (a teacher draws something), encode
  // it as a sync update and broadcast it to every connected participant.
  doc.on('update', (update: Uint8Array) => {
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

function setupConnection(conn: WebSocket, req: IncomingMessage) {
  // The y-websocket client connects to `<server>/<roomName>` — pull the room
  // name straight out of the path.
  const roomName = decodeURIComponent((req.url ?? '/').slice(1).split('?')[0]) || 'default';
  const room = getRoom(roomName);

  conn.binaryType = 'arraybuffer';
  room.conns.set(conn, new Set());

  conn.on('message', (data: ArrayBuffer) => handleMessage(room, conn, new Uint8Array(data)));
  conn.on('close', () => closeConn(room, conn));

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

export function startWhiteboardWebSocketServer(port: number) {
  const wss = new WebSocketServer({ port });
  wss.on('connection', setupConnection);
  wss.on('listening', () => {
    console.log(`[whiteboard] Yjs sync server listening on ws://localhost:${port}`);
  });
  return wss;
}
