import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';

const secure = config.NODE_ENV === 'production';
const name = secure ? '__Host-midad_session' : 'midad_session';

export function readSessionCookie(request: FastifyRequest) {
  const cookies = request.headers.cookie?.split(';') ?? [];
  const match = cookies.find((part) => part.trim().startsWith(`${name}=`));
  return match?.trim().slice(name.length + 1) ?? null;
}

export function setSessionCookie(reply: FastifyReply, token: string, remember: boolean) {
  reply.header('Set-Cookie', `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}${remember ? '; Max-Age=604800' : ''}`);
  reply.header('Cache-Control', 'no-store');
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.header('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}; Max-Age=0`);
  reply.header('Cache-Control', 'no-store');
}

export function validBrowserOrigin(request: FastifyRequest) {
  const origin = request.headers.origin;
  return Boolean(origin && config.CORS_ORIGIN.includes(origin));
}
