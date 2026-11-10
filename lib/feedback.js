import { randomUUID } from 'node:crypto';
import { validateFeedback } from '../public/feedback-model.js';

export const MAX_BODY_BYTES = 32 * 1024;
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

function parseOrigin(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    // Origin headers contain only scheme, host and optional port. Reject credentials,
    // paths and ambiguous representations instead of trusting a substring match.
    if (url.origin !== value || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function isAllowedOrigin(value, env) {
  const origin = parseOrigin(value);
  if (!origin) return false;
  const local = env.VERCEL !== '1' && env.NODE_ENV !== 'production'
    && (!env.VERCEL_ENV || env.VERCEL_ENV === 'development');
  if (loopbackHosts.has(origin.hostname)) {
    return local && ['http:', 'https:'].includes(origin.protocol);
  }
  if (origin.protocol !== 'https:') return false;

  const allowed = new Set();
  for (const key of ['VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_BRANCH_URL']) {
    if (typeof env[key] === 'string') {
      const configured = parseOrigin(`https://${env[key]}`);
      if (configured && !loopbackHosts.has(configured.hostname)) allowed.add(configured.origin);
    }
  }
  if (typeof env.FEEDBACK_ALLOWED_ORIGINS === 'string') {
    for (const value of env.FEEDBACK_ALLOWED_ORIGINS.split(',')) {
      const configured = parseOrigin(value.trim());
      if (configured?.protocol === 'https:' && !loopbackHosts.has(configured.hostname)) {
        allowed.add(configured.origin);
      }
    }
  }
  return allowed.has(origin.origin);
}

function send(response, status, payload) {
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

class BodyError extends Error {
  constructor(status) { super('Invalid request body'); this.status = status; }
}

function checkSize(bytes) {
  if (bytes > MAX_BODY_BYTES) throw new BodyError(413);
}

async function readBody(request) {
  const declaredLength = request.headers?.['content-length'];
  if (typeof declaredLength === 'string' && /^\d+$/.test(declaredLength)) {
    checkSize(Number(declaredLength));
  }

  let bytes;
  if (typeof request[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let size = 0;
    // Node's default iterator destroys the incoming connection when an oversized
    // body throws. Keep it open until the caller has sent the 413 response.
    const stream = typeof request.iterator === 'function'
      ? request.iterator({ destroyOnReturn: false }) : request;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      checkSize(size);
      chunks.push(buffer);
    }
    bytes = Buffer.concat(chunks, size);
  } else if (request.body !== undefined) {
    // Fallback for runtimes that provide only a parsed body. Raw streams above
    // retain whitespace and original encoding for an exact request-byte limit.
    if (Buffer.isBuffer(request.body)) bytes = request.body;
    else if (typeof request.body === 'string') bytes = Buffer.from(request.body);
    else {
      const serialized = JSON.stringify(request.body);
      if (serialized === undefined) throw new BodyError(400);
      bytes = Buffer.from(serialized);
    }
    checkSize(bytes.length);
  } else {
    throw new BodyError(400);
  }
  // Fatal decoding rejects malformed UTF-8 instead of silently storing replacement characters.
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function createFeedbackHandler({ put, env = process.env,
  now = () => new Date(), uuid = randomUUID } = {}) {
  return async function feedbackHandler(request, response) {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return send(response, 405, { ok: false, error: 'POST 요청만 지원합니다.' });
    }
    if (!isAllowedOrigin(request.headers?.origin, env)) {
      return send(response, 403, { ok: false, error: '이 페이지에서는 제출할 수 없습니다.' });
    }
    const contentType = request.headers?.['content-type'];
    if (typeof contentType !== 'string'
      || contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return send(response, 415, { ok: false, error: 'JSON 형식으로 제출해 주세요.' });
    }

    let input;
    try {
      input = await readBody(request);
    } catch (error) {
      const status = error instanceof BodyError ? error.status : 400;
      send(response, status, { ok: false, error: status === 413
        ? '응답이 너무 큽니다. 내용을 줄여 다시 제출해 주세요.'
        : '응답 형식을 확인한 뒤 다시 제출해 주세요.' });
      if (status === 413 && typeof request.resume === 'function') {
        request.once('error', () => {});
        request.resume();
      }
      return;
    }
    const result = validateFeedback(input);
    if (!result.ok) {
      return send(response, 400, { ok: false, error: '입력 내용을 확인해 주세요.', errors: result.errors });
    }

    try {
      const createdAt = now().toISOString();
      const id = uuid();
      const pathname = `feedback/${createdAt.slice(0, 10)}/${createdAt.replace(/[:.]/g, '-')}-${id}.json`;
      const options = { access: 'private', contentType: 'application/json',
        addRandomSuffix: false, allowOverwrite: false };
      if (env.BLOB_READ_WRITE_TOKEN) options.token = env.BLOB_READ_WRITE_TOKEN;
      await put(pathname, JSON.stringify({ ...result.data, id, createdAt }), options);
      return send(response, 201, { ok: true });
    } catch {
      // Never log the submitted payload, provider error or private blob location.
      return send(response, 503, { ok: false, error: '지금은 저장할 수 없습니다. 잠시 후 다시 제출해 주세요.' });
    }
  };
}
