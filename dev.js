#!/usr/bin/env node
// Local preview: builds with drafts, serves dist/ and reloads the browser on changes.
//   npm run dev            -> http://localhost:8000
//   PORT=3000 npm run dev

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 8000;
const WATCH = ['content', 'theme', 'design', 'public', 'admin', 'lib', 'site.json'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.xml': 'application/xml', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.woff2': 'font/woff2',
};
const RELOAD = `<script>new EventSource('/__reload').onmessage=()=>location.reload()</script>`;
const clients = new Set();

async function rebuild() {
  try {
    await build({ drafts: true });
    for (const res of clients) res.write('data: reload\n\n');
  } catch (err) {
    console.error(`❌ ${err.message}`);
  }
}

await rebuild();

let timer;
for (const entry of WATCH) {
  const target = path.join(ROOT, entry);
  if (!fs.existsSync(target)) continue;
  fs.watch(target, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 120);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  let file = path.join(OUT, decodeURIComponent(url.pathname));
  if (!file.startsWith(OUT)) {
    res.writeHead(403).end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
  const found = fs.existsSync(file);
  if (!found) file = path.join(OUT, '404.html');
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  if (ext === '.html' && !file.includes(`${path.sep}admin${path.sep}`)) body = body.toString().replace('</body>', `${RELOAD}</body>`);
  res.writeHead(found ? 200 : 404, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
}).listen(PORT, () => {
  console.log(`\n🖥️  Preview: http://localhost:${PORT}   (admin: http://localhost:${PORT}/admin/)`);
  console.log('   Drafts and scheduled posts are visible here. Ctrl+C to stop.\n');
});
