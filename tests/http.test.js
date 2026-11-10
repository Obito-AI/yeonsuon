import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { open, stat } from 'node:fs/promises';
import { createDevServer } from '../scripts/dev.mjs';
import { createFeedbackHandler } from '../lib/feedback.js';

let server;
let base;
const stored = [];
const videoPath = '/video/연수온_v3.2.2_사용자튜토리얼.mp4';
const downloadPath = '/downloads/연수온_v3.2.2_로컬운영본.html';
const validFeedback = { institution: 'school', stage: 'testing', satisfaction: 5, ease: 4, recommendation: 0 };

before(async () => {
  server = createDevServer({ feedbackHandler: createFeedbackHandler({
    env: { NODE_ENV: 'development' },
    put: async (pathname, body, options) => {
      stored.push({ pathname, body, options });
      return { url: 'https://private.example/unused', downloadUrl: 'https://private.example/unused',
        pathname, contentType: 'application/json', contentDisposition: 'attachment', etag: 'unused' };
    },
  }) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!server?.listening) return;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

function rawRequest(path, { method = 'GET', headers = {}, chunks = [] } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(`${base}/`, { path, method, headers }, response => {
      const buffers = [];
      response.on('data', chunk => buffers.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
        body: Buffer.concat(buffers) }));
    });
    request.setTimeout(4000, () => request.destroy(new Error('HTTP response timed out')));
    request.on('error', reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

test('serves the Korean landing page over HTTP with a local-safe content security policy', async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html; charset=utf-8/);
  assert.match(await response.text(), /연수온/);
  const policy = response.headers.get('content-security-policy');
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /script-src 'self'/);
  assert.match(policy, /connect-src 'self'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);
});

test('serves index.html, local JavaScript and CSS with browser-compatible MIME types', async () => {
  for (const [path, type] of [['/index.html', 'text/html'], ['/feedback.js', 'text/javascript'],
    ['/feedback-model.js', 'text/javascript'], ['/styles.css', 'text/css'], ['/favicon.svg', 'image/svg+xml']]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith(type));
    if (path === '/index.html') assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    await response.arrayBuffer();
  }
});

test('HEAD returns static metadata without transferring the body', async () => {
  const response = await fetch(`${base}/styles.css`, { method: 'HEAD' });
  const file = await stat(new URL('../public/styles.css', import.meta.url));
  assert.equal(response.status, 200);
  assert.equal(Number(response.headers.get('content-length')), file.size);
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test('streams the unchanged download as an attachment with restrictive CSP', async () => {
  const response = await fetch(`${base}${downloadPath}`);
  const file = await stat(new URL(`../public${downloadPath}`, import.meta.url));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /^attachment/);
  assert.equal(response.headers.get('content-security-policy'), "sandbox; default-src 'none'");
  assert.equal(Number(response.headers.get('content-length')), file.size);
  assert.equal((await response.arrayBuffer()).byteLength, file.size);
});

test('returns a video byte range with exact original bytes for browser seeking', async () => {
  const file = await open(new URL(`../public${videoPath}`, import.meta.url));
  try {
    const info = await file.stat();
    const expected = Buffer.alloc(64);
    await file.read(expected, 0, 64, 0);
    const response = await fetch(`${base}${videoPath}`, { headers: { Range: 'bytes=0-63' } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(response.headers.get('content-range'), `bytes 0-63/${info.size}`);
    assert.equal(response.headers.get('content-length'), '64');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
  } finally { await file.close(); }
});

test('supports suffix and open-ended video ranges while HEAD sends no bytes', async () => {
  const file = await stat(new URL(`../public${videoPath}`, import.meta.url));
  for (const range of ['bytes=-32', `bytes=${file.size - 32}-`]) {
    const response = await fetch(`${base}${videoPath}`, { headers: { Range: range } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), `bytes ${file.size - 32}-${file.size - 1}/${file.size}`);
    assert.equal((await response.arrayBuffer()).byteLength, 32);
  }
  const response = await fetch(`${base}${videoPath}`, { method: 'HEAD', headers: { Range: 'bytes=0-7' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-length'), '8');
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test('rejects malformed, multiple or unsatisfiable video ranges with 416', async () => {
  const file = await stat(new URL(`../public${videoPath}`, import.meta.url));
  for (const range of ['bytes=99-1', 'bytes=0-1,3-4', 'bytes=-0', 'bytes=abc', `bytes=${file.size}-`,
    'bytes=900719925474099999999-', 'items=0-1']) {
    const response = await fetch(`${base}${videoPath}`, { headers: { Range: range } });
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get('content-range'), `bytes */${file.size}`);
    await response.arrayBuffer();
  }
});

test('never serves repository files, directories, malformed paths or traversal attempts', async () => {
  for (const path of ['/SPEC.md', '/.env', '/package.json', '/lib/feedback.js', '/api/feedback.js',
    '/downloads/', '/video/', '/missing', '/%zz', '/%00', '/../SPEC.md', '/%2e%2e/SPEC.md',
    '/downloads/%2e%2e/%2e%2e/SPEC.md', '/%252e%252e/SPEC.md', '/..%5cSPEC.md']) {
    const response = await rawRequest(path);
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(response.body.toString(), /BLOB_READ_WRITE_TOKEN|연수온 공개 랜딩페이지 구현 명세/);
  }
});

test('only the exact feedback endpoint dispatches to the API handler', async () => {
  for (const path of ['/api/feedback/', '/api/feedback/extra', '/api/%66eedback', '/api/feedback.js']) {
    assert.equal((await rawRequest(path, { method: 'POST' })).status, 404);
  }
});

test('rejects repeated path separators so download and page security headers cannot be bypassed', async () => {
  for (const path of [`//downloads/${encodeURIComponent('연수온_v3.2.2_로컬운영본.html')}`,
    `/%2fdownloads/${encodeURIComponent('연수온_v3.2.2_로컬운영본.html')}`, '//index.html']) {
    assert.equal((await rawRequest(path)).status, 404, path);
  }
});

test('rejects writes to static files', async () => {
  const response = await fetch(`${base}/styles.css`, { method: 'POST', body: 'replace' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
  await response.arrayBuffer();
});

test('real HTTP feedback POST validates and stores once through injected private storage', async () => {
  const beforeCount = stored.length;
  const response = await fetch(`${base}/api/feedback`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(validFeedback) });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(stored.length, beforeCount + 1);
  assert.equal(stored.at(-1).options.access, 'private');
  assert.equal(JSON.parse(stored.at(-1).body).recommendation, 0);
});

test('real HTTP GET never exposes feedback records', async () => {
  const response = await fetch(`${base}/api/feedback`);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
  assert.equal((await response.json()).ok, false);
});

test('real HTTP malformed JSON returns safe 400 without storage', async () => {
  const beforeCount = stored.length;
  const response = await fetch(`${base}/api/feedback`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base }, body: '{"contact":"private-input"' });
  assert.equal(response.status, 400);
  assert.doesNotMatch(await response.text(), /private-input/);
  assert.equal(stored.length, beforeCount);
});

test('chunked HTTP request above 32768 bytes returns 413 without a socket hangup', async () => {
  const beforeCount = stored.length;
  const response = await rawRequest('/api/feedback', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, 'Transfer-Encoding': 'chunked' },
    chunks: [Buffer.from(JSON.stringify(validFeedback)), Buffer.alloc(32768, ' '), Buffer.from(' ')] });
  assert.equal(response.status, 413);
  assert.equal(JSON.parse(response.body.toString()).ok, false);
  assert.equal(stored.length, beforeCount);
});
