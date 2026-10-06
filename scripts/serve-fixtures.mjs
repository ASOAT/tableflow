import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

// Test-only local static servers; neither is shipped inside the extension.
const workspace = resolve('.');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8' };
for (const port of [4173, 4174]) {
  createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', `http://localhost:${port}`).pathname);
      const file = resolve(workspace, `.${pathname === '/' ? '/tests/fixtures/index.html' : pathname}`);
      if (!file.startsWith(workspace + sep)) { response.writeHead(403).end(); return; }
      const data = await readFile(file);
      response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(data);
    } catch {
      response.writeHead(404).end('Fixture not found');
    }
  }).listen(port, '127.0.0.1', () => console.log(`Fixtures: http://localhost:${port}`));
}
