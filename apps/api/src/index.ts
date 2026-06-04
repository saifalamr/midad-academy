import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { healthRoutes } from './routes/health';

const app = Fastify({ logger: config.NODE_ENV !== 'test' });

async function bootstrap() {
  await app.register(helmet);
  await app.register(cors, { origin: config.CORS_ORIGIN, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  await app.register(healthRoutes, { prefix: '/api' });

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`API running on http://localhost:${config.PORT}`);
}

bootstrap().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
