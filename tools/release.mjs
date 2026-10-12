// Stamps a release: lists every file in docs/ for the service worker to
// precache and sets a version from the files' content, so each redeploy
// reaches the phone the next time Fast opens. Run with: npm run release
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const SKIP = new Set(['sw.js', '.nojekyll', 'robots.txt']);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.nojekyll') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = (await walk(root))
  .map((f) => path.relative(root, f).split(path.sep).join('/'))
  .filter((f) => !SKIP.has(f))
  .sort();

const hash = createHash('sha256');
for (const f of files) {
  if (f === 'js/version.js') continue;
  hash.update(f);
  hash.update(await readFile(path.join(root, f)));
}
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
const version = `${today}-${hash.digest('hex').slice(0, 8)}`;

await writeFile(path.join(root, 'js', 'version.js'), `// Stamped by tools/release.mjs.\nexport const VERSION = '${version}';\n`);

const swPath = path.join(root, 'sw.js');
let sw = await readFile(swPath, 'utf8');
sw = sw.replace(/^const VERSION = .*;$/m, `const VERSION = '${version}';`);
sw = sw.replace(/^const ASSETS = [\s\S]*?\];$/m, `const ASSETS = [\n${files.map((f) => `  '${f}',`).join('\n')}\n];`);
await writeFile(swPath, sw);

console.log(`Release ${version}: ${files.length} files precached.`);
