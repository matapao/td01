// Serves the built browser game from the release in memory (see release.ts), plus /lan.json,
// which tells the page it is talking to a LAN server.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname } from 'node:path';
import type { Release } from './release.ts';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};

export function serveFiles(release: Release, info: () => unknown) {
  return function serve(request: IncomingMessage, response: ServerResponse): void {
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'SAMEORIGIN');
    response.setHeader('referrer-policy', 'same-origin');
    response.setHeader('cross-origin-resource-policy', 'same-origin');
    response.setHeader(
      'content-security-policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob: ws: wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
    );
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (path === '/lan.json') {
      response
        .writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-cache' })
        .end(request.method === 'HEAD' ? undefined : JSON.stringify(info()));
      return;
    }
    if (path.endsWith('/')) path += 'index.html';
    const name = path.replace(/^\/+/, '');
    if (name.split('/').some((part) => part === '..')) {
      response.writeHead(403).end();
      return;
    }
    const body = release.files.get(name);
    if (!body) {
      response.writeHead(404, { 'content-type': TYPES['.txt'] }).end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': TYPES[extname(name)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  };
}
