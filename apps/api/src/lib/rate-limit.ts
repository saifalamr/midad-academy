import type { FastifyRequest } from 'fastify';

export function rateLimitKey(request: FastifyRequest, verify: (token: string) => { id?: unknown }) {
  // Auth/recovery limits remain tied to the source IP even with a valid token.
  if (!request.url.startsWith('/api/auth/')) {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const actor = verify(header.slice(7));
        if (typeof actor.id === 'string' && actor.id) return `user:${actor.id}`;
      } catch { /* Invalid/expired tokens share the anonymous IP limit. */ }
    }
  }
  return `ip:${request.ip}`;
}
