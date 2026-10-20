// Explicit operator tool: creates one private PostgreSQL archive or verifies it
// in a separate, empty restore-check database. It never deletes a database.
import { spawn } from 'node:child_process';
import { open, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
const [action, supplied] = process.argv.slice(2);
if (!['create', 'verify'].includes(action) || !supplied) throw new Error('Usage: node scripts/database-backup.mjs create|verify /absolute/path/archive.dump');
const source = new URL(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '');
const archive = resolve(supplied);
function connection(url) {
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PostgreSQL connection required');
  return { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: url.searchParams.get('sslmode') || process.env.PGSSLMODE || 'prefer' };
}
function run(command, args, url) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { env: connection(url), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', value => { output += value; });
    // Do not surface tool diagnostics that might contain connection credentials.
    child.stderr.resume();
    child.on('error', () => reject(new Error(`${command} is unavailable. Install PostgreSQL client tools.`)));
    child.on('exit', code => code === 0 ? resolveResult(output.trim()) : reject(new Error(`${command} failed (exit ${code}); inspect connection access privately.`)));
  });
}
if (action === 'create') {
  const file = await open(archive, 'wx', 0o600); await file.close();
  await run('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', archive], source);
  await chmod(archive, 0o600);
  await run('pg_restore', ['--list', archive], source);
  console.log('Private archive created and archive structure checked. Restoration is not verified until the separate verify command passes.');
} else {
  const target = new URL(process.env.RESTORE_DATABASE_URL || '');
  if (!/restore_check$/.test(target.pathname.slice(1)) || (target.hostname === source.hostname && target.port === source.port && target.pathname === source.pathname)) throw new Error('Use a separate empty database whose name ends with restore_check');
  const existing = await run('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"], target);
  if (existing !== '0') throw new Error('Restore-check database is not empty; refusing to overwrite data');
  await run('pg_restore', ['--no-owner', '--no-acl', '--exit-on-error', '--dbname', decodeURIComponent(target.pathname.slice(1)), archive], target);
  const result = await run('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT (SELECT count(*) FROM "User") AS users, (SELECT count(*) FROM "Enrollment") AS enrollments, (SELECT count(*) FROM "SessionReport") AS reports, (SELECT count(*) FROM "HomeworkSubmission") AS homework, (SELECT count(*) FROM "CourseApplication") AS applications;'], target);
  console.log('Restore passed. Row counts (users|enrollments|reports|homework|applications): ' + result);
}
