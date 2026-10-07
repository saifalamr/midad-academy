// Extract browser assets without changing archive ownership (works in containers).
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, chmod } from 'node:fs/promises';
import { createBrotliDecompress } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export async function chromiumPath() {
  const bin = path.resolve(path.dirname(require.resolve('@sparticuz/chromium')), '../bin');
  const directory = path.join(tmpdir(), 'midad-preview-browser');
  await mkdir(directory, { recursive: true });
  const executable = path.join(directory, 'chromium');
  await pipeline(createReadStream(path.join(bin, 'chromium.br')), createBrotliDecompress(), createWriteStream(executable));
  await chmod(executable, 0o755);
  for (const name of ['swiftshader', 'fonts', 'al2023']) {
    const archive = path.join(directory, `${name}.tar`);
    await pipeline(createReadStream(path.join(bin, `${name}.tar.br`)), createBrotliDecompress(), createWriteStream(archive));
    await new Promise((resolve, reject) => { const tar = spawn('tar', ['--no-same-owner', '-xf', archive, '-C', directory]); tar.once('error', reject); tar.once('exit', (code) => code === 0 ? resolve() : reject(new Error('Browser asset extraction failed'))); });
  }
  process.env.LD_LIBRARY_PATH = `${directory}/lib:${directory}:${process.env.LD_LIBRARY_PATH ?? ''}`;
  process.env.FONTCONFIG_PATH = `${directory}/fonts`;
  return executable;
}
