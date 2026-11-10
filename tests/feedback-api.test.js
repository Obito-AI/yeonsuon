import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createFeedbackHandler } from '../lib/feedback.js';

const valid = (overrides = {}) => ({ institution: 'school', stage: 'testing',
  satisfaction: 4, ease: 3, recommendation: 8, ...overrides });
const productionEnv = {
  NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production',
  VERCEL_URL: 'feedback-deployment.vercel.app',
  VERCEL_PROJECT_PRODUCTION_URL: 'feedback.vercel.app',
  VERCEL_BRANCH_URL: 'feedback-git-main.vercel.app',
  BLOB_READ_WRITE_TOKEN: 'server-only-test-token',
};

function response() {
  return { headers: {}, statusCode: 200, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = '') { this.body = value; },
  };
}

async function invoke({ method = 'POST', origin = 'https://feedback.vercel.app',
  contentType = 'application/json', body = valid(), chunks, headers = {}, env = productionEnv,
  putError, readError, parsedBody } = {}) {
  const stored = [];
  const handler = createFeedbackHandler({ env,
    now: () => new Date('2026-11-11T03:04:05.000Z'),
    uuid: () => '86238258-6064-4bbd-ac13-259d2bd72467',
    put: async (pathname, data, options) => {
      if (putError) throw putError;
      stored.push({ pathname, data, options });
      return { url: 'https://private-storage.example/private.json',
        downloadUrl: 'https://private-storage.example/private.json?download=1',
        pathname, contentType: 'application/json', contentDisposition: 'attachment', etag: 'private-etag' };
    },
  });
  const request = chunks || readError
    ? Readable.from(readError ? (async function* () { throw new Error('sensitive-reader-detail'); })() : chunks)
    : { body };
  request.method = method;
  request.headers = { 'content-type': contentType, origin, ...headers };
  if (parsedBody !== undefined) request.body = parsedBody;
  const res = response();
  await handler(request, res);
  return { ...res, json: JSON.parse(res.body), stored };
}

test('stores only normalized feedback in private Blob with a server-generated filename', async () => {
  const res = await invoke({ body: valid({ interviewConsent: true, contact: ' person@example.kr ',
    difficulties: '  자료 찾기  ', website: '' }) });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json, { ok: true });
  assert.equal(res.stored.length, 1);
  const entry = res.stored[0];
  assert.equal(entry.pathname, 'feedback/2026-11-11/2026-11-11T03-04-05-000Z-86238258-6064-4bbd-ac13-259d2bd72467.json');
  assert.deepEqual(entry.options, { access: 'private', contentType: 'application/json',
    addRandomSuffix: false, allowOverwrite: false, token: 'server-only-test-token' });
  const saved = JSON.parse(entry.data);
  assert.equal(saved.createdAt, '2026-11-11T03:04:05.000Z');
  assert.equal(saved.id, '86238258-6064-4bbd-ac13-259d2bd72467');
  assert.equal(saved.contact, 'person@example.kr');
  assert.equal(saved.difficulties, '자료 찾기');
  assert.equal(saved.experience, '');
  assert.deepEqual(saved.usefulFeatures, []);
  for (const key of ['website', 'ip', 'userAgent', 'origin']) assert.equal(Object.hasOwn(saved, key), false);
  for (const value of ['person@example.kr', 'private-storage', 'private-etag', 'server-only-test-token']) {
    assert.equal(res.body.includes(value), false);
    assert.equal(entry.pathname.includes(value), false);
  }
});

test('applies JSON/no-store security headers to successful and rejected requests', async () => {
  for (const method of ['POST', 'GET']) {
    const res = await invoke({ method });
    assert.match(res.headers['content-type'], /^application\/json/);
    assert.match(res.headers['cache-control'], /no-store/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  }
});

for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
  test(`rejects ${method} without invoking storage and advertises POST`, async () => {
    const res = await invoke({ method });
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.allow, 'POST');
    assert.equal(res.stored.length, 0);
  });
}

test('accepts each exact Vercel configured origin and explicit custom HTTPS origin', async () => {
  const env = { ...productionEnv, FEEDBACK_ALLOWED_ORIGINS: ' https://custom.example, https://another.example:8443 ' };
  for (const origin of ['https://feedback.vercel.app', 'https://feedback-deployment.vercel.app',
    'https://feedback-git-main.vercel.app', 'https://custom.example', 'https://another.example:8443']) {
    assert.equal((await invoke({ origin, env })).statusCode, 201);
  }
});

const forbiddenOrigins = [undefined, null, '', 'null', ['https://feedback.vercel.app'],
  'https://attacker.vercel.app', 'https://feedback.vercel.app.attacker.example',
  'https://feedback.vercel.app@attacker.example', 'https://attacker.example@feedback.vercel.app',
  'https://feedback.vercel.app:444', 'https://feedback.vercel.app/path',
  'https://feedback.vercel.app/', 'https://feedback.vercel.app?query=1',
  'https://feedback.vercel.app#fragment', 'http://feedback.vercel.app',
  'https://feedback.vercel.app https://attacker.example', 'ftp://feedback.vercel.app',
  'http://localhost:3000', 'http://127.0.0.1:3000', 'https://localhost',
];

for (const [index, origin] of forbiddenOrigins.entries()) {
  test(`rejects untrusted or malformed origin #${index + 1} regardless of Host`, async () => {
    const res = await invoke({ headers: { origin, host: 'feedback.vercel.app',
      'x-forwarded-host': 'feedback.vercel.app' } });
    assert.equal(res.statusCode, 403);
    assert.equal(res.stored.length, 0);
  });
}

test('never derives an allowed origin from attacker-controlled Host headers', async () => {
  const res = await invoke({ origin: 'https://attacker.example', env: { NODE_ENV: 'production' },
    headers: { host: 'attacker.example', 'x-forwarded-host': 'attacker.example' } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.stored.length, 0);
});

test('ignores unsafe or malformed configured origins in production', async () => {
  for (const origin of ['http://custom.example', 'http://localhost:3000', 'https://localhost',
    'https://user:password@custom.example', 'https://custom.example/path']) {
    const res = await invoke({ origin, env: { ...productionEnv, FEEDBACK_ALLOWED_ORIGINS: origin } });
    assert.equal(res.statusCode, 403);
  }
});

test('allows localhost loopback origins only during local development', async () => {
  for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
    assert.equal((await invoke({ origin, env: { NODE_ENV: 'development' } })).statusCode, 201);
    assert.equal((await invoke({ origin, env: { NODE_ENV: 'development', VERCEL: '1' } })).statusCode, 403);
  }
  assert.equal((await invoke({ origin: 'http://localhost.attacker.example:3000', env: {} })).statusCode, 403);
});

test('requires application/json and accepts UTF-8 charset', async () => {
  assert.equal((await invoke({ contentType: 'application/json; charset=utf-8' })).statusCode, 201);
  for (const contentType of ['', null, ['application/json'], 'text/plain', 'application/x-www-form-urlencoded',
    'application/json-malicious', 'application/problem+json']) {
    const res = await invoke({ contentType });
    assert.equal(res.statusCode, 415);
    assert.equal(res.stored.length, 0);
  }
});

test('reads raw Buffer and chunked UTF-8 JSON bodies without corrupting Korean text', async () => {
  const body = JSON.stringify(valid({ improvements: '한글 개선 의견' }));
  const bytes = Buffer.from(body);
  const chunks = [...bytes].map(byte => Buffer.from([byte]));
  for (const input of [{ body }, { body: bytes }, { chunks }]) {
    const res = await invoke(input);
    assert.equal(res.statusCode, 201);
    assert.equal(JSON.parse(res.stored[0].data).improvements, '한글 개선 의견');
  }
});

test('accepts 32768 raw bytes and rejects the next byte regardless of Content-Length', async () => {
  const json = JSON.stringify(valid());
  const exact = json + ' '.repeat(32768 - Buffer.byteLength(json));
  assert.equal((await invoke({ chunks: [Buffer.from(exact)] })).statusCode, 201);
  for (const input of [{ body: exact + ' ' }, { body: Buffer.from(exact + ' ') },
    { chunks: [Buffer.from(exact), Buffer.from(' ')] },
    { chunks: [Buffer.from(exact + ' ')], headers: { 'content-length': '5' } }]) {
    const res = await invoke(input);
    assert.equal(res.statusCode, 413);
    assert.equal(res.stored.length, 0);
  }
});

test('counts UTF-8 bytes and bounds already parsed object bodies', async () => {
  const payload = valid({ improvements: '한'.repeat(11000) });
  for (const input of [{ body: payload }, { body: JSON.stringify(payload) },
    { chunks: [Buffer.from(JSON.stringify(payload))] }]) {
    const res = await invoke(input);
    assert.equal(res.statusCode, 413);
    assert.equal(res.stored.length, 0);
  }
});

test('enforces original streamed byte size even when runtime helpers provide a smaller parsed body', async () => {
  const json = JSON.stringify(valid());
  const original = json + ' '.repeat(32769 - Buffer.byteLength(json));
  const res = await invoke({ chunks: [Buffer.from(original)], parsedBody: valid() });
  assert.equal(res.statusCode, 413);
  assert.equal(res.stored.length, 0);
});

test('preserves the request connection long enough to send an oversized-stream error', async () => {
  const request = Readable.from([Buffer.alloc(32769), Buffer.from('remaining')]);
  request.method = 'POST';
  request.headers = { origin: 'https://feedback.vercel.app', 'content-type': 'application/json' };
  const res = response();
  res.end = function (body) {
    assert.equal(request.destroyed, false, 'request must remain usable until response is sent');
    this.body = body;
  };
  await createFeedbackHandler({ env: productionEnv, put: () => assert.fail('must not store') })(request, res);
  assert.equal(res.statusCode, 413);
  request.destroy();
});

test('rejects excessive declared length before reading the request', async () => {
  const res = await invoke({ headers: { 'content-length': '32769' }, readError: true });
  assert.equal(res.statusCode, 413);
  assert.equal(res.stored.length, 0);
});

test('returns safe errors for malformed JSON, invalid UTF-8, failed reads and unserializable body', async () => {
  const circular = {}; circular.self = circular;
  for (const input of [{ body: '{"contact":"sensitive"' }, { body: '' }, { readError: true },
    { body: circular }, { body: Buffer.from([0xff, 0xfe]) }]) {
    const res = await invoke(input);
    assert.equal(res.statusCode, 400);
    assert.equal(res.stored.length, 0);
    assert.equal(res.body.includes('sensitive'), false);
    assert.equal(res.body.includes('stack'), false);
  }
});

test('rejects invalid fields, unknown keys and populated honeypot before storage', async () => {
  for (const body of [valid({ institution: '' }), valid({ recommendation: 11 }),
    valid({ secret: 'sensitive-value' }), valid({ website: 'bot' }), valid({ contact: 'sensitive-value' }),
    null, [], 'null']) {
    const res = await invoke({ body });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json.ok, false);
    assert.equal(res.stored.length, 0);
    assert.equal(res.body.includes('sensitive-value'), false);
  }
});

test('storage failures return a generic retryable error without private data or provider details', async () => {
  const res = await invoke({ body: valid({ interviewConsent: true, contact: 'person@example.kr' }),
    putError: new Error('provider: server-only-test-token person@example.kr private-storage.example') });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json.ok, false);
  assert.match(res.json.error, /다시/);
  for (const value of ['provider', 'server-only-test-token', 'person@example.kr', 'private-storage.example']) {
    assert.equal(res.body.includes(value), false);
  }
});
