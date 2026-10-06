#!/usr/bin/env node
// PreToolUse (Edit|Write|MultiEdit): hace cumplir arch-first antes de que se escriba código.
// Solo actúa en carpetas con architecture.json. Bloquea (exit 2) si:
//  - la arquitectura no está aprobada (sello humano con hash) y se escribe código;
//  - el archivo de código queda fuera de las capas declaradas;
//  - el código nuevo rompe la regla de dependencia o usa infraestructura/entorno donde no corresponde;
//  - Claude intenta sellar la aprobación por su cuenta.
const path = require('path');
const { run, block, projectDir } = require('./lib.cjs');

run('arch-guard', (input) => {
  const ti = input.tool_input || {}, cwd = projectDir(input);
  const target = ti.file_path; if (!target) return;
  let L; try { L = require(path.join(__dirname, '..', 'skills', 'arch-first', 'scripts', 'archlib.cjs')); } catch { return; }
  const abs = path.resolve(cwd, target);
  const found = L.findConfig(path.dirname(abs), cwd); if (!found) return;
  let cfg; try { cfg = L.loadConfig(found.file); } catch (e) { block(`architecture.json inválido: ${e.message}`, 'invalid-config'); }
  const rel = L.posix(path.relative(cfg.dir, abs)); if (rel.startsWith('..')) return;
  const text = String(ti.content || '') + String(ti.new_string || '') + (Array.isArray(ti.edits) ? ti.edits.map((e) => (e && e.new_string) || '').join('\n') : '');
  if (/(^|\/)ARCHITECTURE\.md$/.test(rel) && /^(Estado:\s*aprobada|Aprobada-hash:)/im.test(text)) block('la aprobación de la arquitectura la da la persona con scripts/approve.cjs, no Claude.', 'seal-by-claude');
  if (!L.isCode(rel) || L.allowedOutside(cfg, rel)) return;
  const st = L.approvalState(cfg);
  if (!st.approved) block(`no se escribe código antes de aprobar la arquitectura (${st.reason}). Corré /dev-flow:arch-first, mostrá el preview y pedile al usuario que la apruebe con approve.cjs.`, 'unapproved');
  const layer = L.layerOf(cfg, rel);
  if (!layer) block(`${rel} queda fuera de las capas declaradas en architecture.json (${Object.values(cfg.layers).map((l) => l.paths.join(',')).join(' | ')}). Ubicalo en una capa o cambiá el diseño y volvé a aprobarlo.`, 'outside-layers');
  const v = L.checkText(cfg, rel, text);
  if (v.length) block(`arquitectura hexagonal en ${rel}:\n` + v.map((x) => `- línea ${x.line}: ${x.msg}`).join('\n'), 'dependency-rule');
});
