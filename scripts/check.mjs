import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(root, 'public');
const sourceDirs = ['api', 'lib', 'scripts', 'tests', 'public'];
let count = 0;
for (const directory of sourceDirs) {
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:js|mjs)$/.test(entry.name)) continue;
    const file = path.join(root, directory, entry.name);
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}\n${result.stderr}`);
    count++;
  }
}
const page = await readFile(path.join(publicRoot, 'index.html'), 'utf8');
const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Duplicate HTML ids');
for (const match of page.matchAll(/\s(?:aria-describedby|aria-labelledby|for)="([^"]+)"/g)) {
  for (const id of match[1].split(/\s+/)) assert.ok(ids.includes(id), `Missing label/ARIA target: ${id}`);
}
for (const match of page.matchAll(/\b(?:src|href|poster)="(\/[^"]+)"/g)) {
  if (match[1].startsWith('/api/')) continue;
  const target = path.resolve(publicRoot, `.${decodeURIComponent(match[1])}`);
  assert.ok(target.startsWith(`${publicRoot}${path.sep}`), 'Asset escapes public directory');
  await access(target);
}
assert.doesNotMatch(page, /\son\w+\s*=|<style\b|\sstyle\s*=/i, 'Inline handlers/styles break the CSP');
for (const match of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  assert.ok(/\bsrc="\//.test(match[1]) && !match[2].trim(), 'Only same-origin external scripts allowed');
}
for (const [file, hash] of [
  ['downloads/연수온_v3.2.2_로컬운영본.html', 'cba2455755fe2344b4d020cbe2f0c24b6bce12d3c125bd1265e097a7582ed0df'],
  ['video/연수온_v3.2.2_사용자튜토리얼.mp4', 'ee00b1f860998530f280508f7594d022a5fbdecd9224c81ebb4f2faefcdb751b'],
]) {
  assert.equal(createHash('sha256').update(await readFile(path.join(publicRoot, file))).digest('hex'), hash, `${file} changed`);
}
const config = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
assert.equal(config.outputDirectory, 'public');
assert.equal(config.build.env.NODEJS_HELPERS, '0');
assert.deepEqual((await readdir(path.join(root, 'api'))).sort(), ['feedback.js'], 'Unexpected public API');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
assert.deepEqual(Object.keys(manifest.dependencies || {}), ['@vercel/blob']);
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
assert.equal(lock.packages[''].dependencies['@vercel/blob'], manifest.dependencies['@vercel/blob']);
const api = await import('../api/feedback.js');
assert.equal(typeof api.default, 'function');
console.log(`Check passed: ${count} JavaScript files, HTML labels and local links, CSP compatibility, API import, configuration, dependency lock, and both original asset hashes.`);
