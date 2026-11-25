import {readdir, readFile, writeFile} from 'node:fs/promises';
import {extname, join} from 'node:path';
import {brotliCompressSync, constants, gzipSync} from 'node:zlib';

const root = process.argv[2];
if (!root) throw new Error('Indica la carpeta browser de Angular.');
const formats = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt']);
let processed = 0;

async function compress(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      await compress(file);
    } else if (entry.isFile() && formats.has(extname(entry.name))) {
      const content = await readFile(file);
      if (content.length < 512) continue;
      await writeFile(file + '.br', brotliCompressSync(content, {
        params: {[constants.BROTLI_PARAM_QUALITY]: 9},
      }));
      await writeFile(file + '.gz', gzipSync(content, {level: 9}));
      processed++;
    }
  }
}

await compress(root);
console.log('Archivos preparados en Brotli y gzip:', processed);
