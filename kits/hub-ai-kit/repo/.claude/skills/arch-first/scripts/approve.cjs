#!/usr/bin/env node
// Aprobación humana del diseño de arquitectura. Lo corre la persona, no Claude (un hook bloquea que Claude lo ejecute).
// Sella ARCHITECTURE.md con el hash de architecture.json + el documento: si el diseño cambia después, la aprobación se invalida.
// Uso: node approve.cjs [--dir <carpeta con architecture.json>]
const fs = require('fs'), path = require('path');
const L = require('./archlib.cjs');
const argv = process.argv.slice(2);
const dir = path.resolve(argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : process.cwd());
const found = L.findConfig(dir, dir);
const fail = m => { console.error('NO SE APROBÓ: ' + m); process.exit(1); };
if (!found) fail(`no hay architecture.json en ${dir}`);
const cfg = L.loadConfig(found.file);
const mdPath = L.archPaths(cfg).md;
if (!fs.existsSync(mdPath)) fail('falta docs/architecture/ARCHITECTURE.md');
let md = fs.readFileSync(mdPath, 'utf8');
if (/\(completar\)/i.test(md)) fail('ARCHITECTURE.md todavía tiene secciones "(completar)".');
const ports = cfg.ports || {};
if (!((ports.driving || []).length + (ports.driven || []).length)) fail('architecture.json no declara ningún puerto (ports.driving / ports.driven).');
md = md.replace(/^(Estado|Aprobada-hash):.*\r?\n/gim, '');
const lines = md.split('\n'); const i = lines.findIndex(l => /^#\s/.test(l));
const stamp = [`Estado: aprobada (${new Date().toISOString().slice(0, 10)})`, 'Aprobada-hash: @@HASH@@'];
lines.splice(i + 1, 0, '', ...stamp);
fs.writeFileSync(mdPath, lines.join('\n'));
const hash = L.approvalHash(cfg);
fs.writeFileSync(mdPath, fs.readFileSync(mdPath, 'utf8').replace('@@HASH@@', hash));
console.log(`Aprobada. Sello ${hash.slice(0, 12)}…\nSi cambiás architecture.json o ARCHITECTURE.md hay que volver a aprobar.`);
