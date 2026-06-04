import type { FastifyRequest, FastifyReply } from 'fastify';

// Extends @fastify/jwt so request.user is typed everywhere
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; role: string };
    user: { id: string; email: string; role: string };
  }
}

// Adds app.authenticate as a known method on every FastifyInstance
declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}
