#!/usr/bin/env node
// Servidor estático mínimo con recarga automática para previews de diseño. Sin dependencias.
// Uso: node serve.cjs [carpeta] [--port 4173] [--no-open]
// Recarga el navegador cuando cambia cualquier archivo de la carpeta.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const noOpen = args.includes('--no-open');
const pi = args.indexOf('--port');
const startPort = pi >= 0 ? Number(args[pi + 1]) : 4173;
const dirArg = args.find((a, i) => !a.startsWith('--') && (pi < 0 || i !== pi + 1));
const root = path.resolve(dirArg || '.');

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`No existe la carpeta: ${root}`);
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
};
const RELOAD = `<script>(function(){var v=null;setInterval(function(){fetch('/__v',{cache:'no-store'}).then(function(r){return r.text()}).then(function(t){if(v===null)v=t;else if(t!==v)location.reload()}).catch(function(){})},500)})()</script>`;

function newest(dir) {
  let m = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    try {
      m = Math.max(m, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
    } catch { /* archivo en uso o borrado: ignorar */ }
  }
  return m;
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/__v') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end(String(newest(root)));
  }
  let file = path.normalize(path.join(root, url));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Prohibido'); } // evita salir de la carpeta
  try {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    let body = fs.readFileSync(file);
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    if (type.startsWith('text/html')) body = Buffer.from(body.toString('utf8').replace(/<\/body>/i, `${RELOAD}</body>`));
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
});

function listen(port, tries = 0) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && tries < 20) listen(port + 1, tries + 1);
    else { console.error(e.message); process.exit(1); }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`Preview en ${url}  (sirve ${root}; Ctrl+C para cortar)`);
    if (noOpen) return;
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* sin navegador: abrir la URL a mano */ }
  });
}
listen(startPort);
