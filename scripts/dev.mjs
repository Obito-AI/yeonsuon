import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const pagePolicy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.mp4': 'video/mp4',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function textResponse(response, status, message) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(message);
}

function decodedPath(rawPath) {
  try {
    const path = decodeURIComponent(rawPath);
    if (!path.startsWith('/') || path.includes('//') || path.includes('\\') || path.includes('\0')
      || path.split('/').some(segment => segment.startsWith('.'))) return null;
    return path;
  } catch {
    return null;
  }
}

function byteRange(header, size) {
  if (typeof header !== 'string') return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || !size) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || start >= size || start > end) return null;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

async function defaultFeedbackHandler(request, response) {
  const { default: handler } = await import('../api/feedback.js');
  return handler(request, response);
}

export function createDevServer({ feedbackHandler = defaultFeedbackHandler } = {}) {
  const rootPath = realpath(publicDirectory);
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Cache-Control', 'no-store');
    const rawPath = (request.url || '').split('?', 1)[0];

    try {
      if (rawPath === '/api/feedback') {
        await feedbackHandler(request, response);
        return;
      }
      if (rawPath.startsWith('/api/')) return textResponse(response, 404, 'Not found');
      const path = decodedPath(rawPath);
      if (!path) return textResponse(response, 404, 'Not found');

      const root = await rootPath;
      const candidate = resolve(root, `.${path === '/' ? '/index.html' : path}`);
      let filename;
      let info;
      try {
        filename = await realpath(candidate);
        if (!filename.startsWith(root + sep)) return textResponse(response, 404, 'Not found');
        info = await stat(filename);
        if (!info.isFile()) return textResponse(response, 404, 'Not found');
      } catch {
        return textResponse(response, 404, 'Not found');
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.setHeader('Allow', 'GET, HEAD');
        return textResponse(response, 405, 'Method not allowed');
      }

      response.setHeader('Content-Type', mimeTypes[extname(filename).toLowerCase()] || 'application/octet-stream');
      response.setHeader('Accept-Ranges', 'bytes');
      if (path === '/' || path === '/index.html') response.setHeader('Content-Security-Policy', pagePolicy);
      if (path.startsWith('/downloads/')) {
        response.setHeader('Content-Disposition', 'attachment');
        response.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
      }

      let start = 0;
      let end = info.size - 1;
      if (request.headers.range !== undefined) {
        const range = byteRange(request.headers.range, info.size);
        if (!range) {
          response.setHeader('Content-Range', `bytes */${info.size}`);
          return textResponse(response, 416, 'Range not satisfiable');
        }
        ({ start, end } = range);
        response.statusCode = 206;
        response.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
      }
      response.setHeader('Content-Length', Math.max(end - start + 1, 0));
      if (request.method === 'HEAD' || info.size === 0) return response.end();

      const file = createReadStream(filename, { start, end });
      file.once('error', () => response.destroy());
      response.once('close', () => file.destroy());
      file.pipe(response);
    } catch {
      if (response.headersSent) return response.destroy();
      if (rawPath === '/api/feedback') {
        response.statusCode = 503;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        return response.end(JSON.stringify({ ok: false, error: '지금은 저장할 수 없습니다. 잠시 후 다시 제출해 주세요.' }));
      }
      return textResponse(response, 500, 'Internal server error');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT must be an integer between 1 and 65535.');
    process.exitCode = 1;
  } else {
    const server = createDevServer();
    server.once('error', () => {
      console.error('Could not start the local development server. Check the port and try again.');
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => console.log(`연수온 로컬 미리보기: http://127.0.0.1:${port}`));
  }
}
