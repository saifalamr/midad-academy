import type { FastifyRequest } from 'fastify';
import { readSessionCookie } from './session-cookie';

export function rateLimitKey(request: FastifyRequest, verify: (token: string) => { id?: unknown }) {
  // Auth/recovery limits remain tied to the source IP even with a valid token.
  const sessionRoute = /^\/api\/auth\/(me|session|whiteboard-ticket|logout)(?:\?|$)/.test(request.url);
  if (!request.url.startsWith('/api/auth/') || sessionRoute) {
    const header = request.headers.authorization === 'Bearer cookie'
      ? `Bearer ${readSessionCookie(request) ?? ''}`
      : (request.headers.authorization || (readSessionCookie(request) ? `Bearer ${readSessionCookie(request)}` : undefined));
    if (header?.startsWith('Bearer ')) {
      try {
        const actor = verify(header.slice(7));
        if (typeof actor.id === 'string' && actor.id) return `user:${actor.id}`;
      } catch { /* Invalid/expired tokens share the anonymous IP limit. */ }
    }
  }
  return `ip:${request.ip}`;
}
