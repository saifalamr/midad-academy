// Local-only PostgreSQL-compatible database. Never expose this port publicly.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readdir, readFile } from 'node:fs/promises';
export const db = new PGlite(process.env.NODE_ENV === 'test' ? undefined : './.dev-db');
await db.waitReady;
await db.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)');
const directory = './packages/database/prisma/migrations';
for (const name of (await readdir(directory)).filter((s) => /^\d/.test(s)).sort()) {
  const applied = await db.query('SELECT name FROM _local_migrations WHERE name = $1', [name]);
  if (applied.rows.length) continue;
  const sql = await readFile(`${directory}/${name}/migration.sql`, 'utf8');
  await db.transaction(async (tx) => { await tx.exec(sql); await tx.query('INSERT INTO _local_migrations (name) VALUES ($1)', [name]); });
}
export const server = new PGLiteSocketServer({ db, port: 5433, host: '127.0.0.1', maxConnections: 10 });
await server.start();
console.log('Local preview database ready at 127.0.0.1:5433');
