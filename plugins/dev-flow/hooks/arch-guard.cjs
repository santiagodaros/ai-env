#!/usr/bin/env node
// PreToolUse (Edit|Write|MultiEdit): hace cumplir arch-first antes de que se escriba código.
// Solo actúa en carpetas con architecture.json. Bloquea (exit 2) si:
//  - la arquitectura no está aprobada (sello humano con hash) y se escribe código;
//  - el archivo de código queda fuera de las capas declaradas;
//  - el código nuevo rompe la regla de dependencia o usa infraestructura/entorno donde no corresponde;
//  - Claude intenta sellar la aprobación por su cuenta.
const fs = require('fs'), path = require('path');
if (require('./lib.cjs').off('arch-guard')) process.exit(0);
let raw = '';
process.stdin.on('data', c => (raw += c));
process.stdin.on('end', () => {
  let ti = {}, cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try { const i = JSON.parse(raw); ti = i.tool_input || {}; if (!process.env.CLAUDE_PROJECT_DIR && i.cwd) cwd = i.cwd; } catch { process.exit(0); }
  const target = ti.file_path; if (!target) process.exit(0);
  let L; try { L = require(path.join(__dirname, '..', 'skills', 'arch-first', 'scripts', 'archlib.cjs')); } catch { process.exit(0); }
  const abs = path.resolve(cwd, target);
  const found = L.findConfig(path.dirname(abs), cwd); if (!found) process.exit(0);
  let cfg; try { cfg = L.loadConfig(found.file); } catch (e) { process.stderr.write(`architecture.json inválido: ${e.message}\n`); process.exit(2); }
  const rel = L.posix(path.relative(cfg.dir, abs)); if (rel.startsWith('..')) process.exit(0);
  const text = String(ti.content || '') + String(ti.new_string || '') + (Array.isArray(ti.edits) ? ti.edits.map(e => e.new_string || '').join('\n') : '');
  const block = m => { process.stderr.write(m + '\n'); process.exit(2); };
  if (/(^|\/)ARCHITECTURE\.md$/.test(rel) && /^(Estado:\s*aprobada|Aprobada-hash:)/im.test(text)) block('Bloqueado: la aprobación de la arquitectura la da la persona con scripts/approve.cjs, no Claude.');
  if (!L.isCode(rel) || L.allowedOutside(cfg, rel)) process.exit(0);
  const st = L.approvalState(cfg);
  if (!st.approved) block(`Bloqueado: no se escribe código antes de aprobar la arquitectura (${st.reason}). Corré /dev-flow:arch-first, mostrá el preview y pedile al usuario que la apruebe con approve.cjs.`);
  const layer = L.layerOf(cfg, rel);
  if (!layer) block(`Bloqueado: ${rel} queda fuera de las capas declaradas en architecture.json (${Object.values(cfg.layers).map(l => l.paths.join(',')).join(' | ')}). Ubicalo en una capa o cambiá el diseño y volvé a aprobarlo.`);
  const v = L.checkText(cfg, rel, text);
  if (v.length) block(`Bloqueado por arquitectura hexagonal en ${rel}:\n` + v.map(x => `- línea ${x.line}: ${x.msg}`).join('\n'));
  process.exit(0);
});
