#!/usr/bin/env node
// Configura lo que un plugin no puede distribuir por sí mismo: la statusline (la única fuente del límite de 5 h)
// y la actualización automática del marketplace. Idempotente. Sin --apply solo muestra qué haría.
// Uso: node setup.cjs [--apply] [--force-statusline] [--worktrees [<raíz>]]
//   --worktrees  registra el hook de worktrees en tus settings de usuario para que `claude -w` también los cree fuera
//                del repo (por defecto en ~/worktrees/<repo>/<nombre>) y los borre cerrando sus procesos. El plugin ya lo
//                hace para subagentes con isolation: worktree; el flag -w solo respeta hooks de settings.
const fs = require('fs'), os = require('os'), path = require('path');
const argv = process.argv.slice(2);
const apply = argv.includes('--apply'), force = argv.includes('--force-statusline');
const home = process.env.AI_ENV_HOME || os.homedir();
const src = path.join(__dirname, '..', '..', '..', 'scripts', 'statusline.cjs');
const dstDir = path.join(home, '.claude', 'ai-env'), dst = path.join(dstDir, 'statusline.cjs');
const settingsFile = path.join(home, '.claude', 'settings.json');
const wantCmd = `node "${dst.replace(/\\/g, '/')}"`;
const done = [], todo = [], manual = [];
const wi = argv.indexOf('--worktrees');
const wantWt = wi >= 0;
const wtRoot = wantWt && argv[wi + 1] && !argv[wi + 1].startsWith('--') ? argv[wi + 1] : '~/worktrees';
const wtDir = path.join(dstDir, 'worktree');
const wtFiles = [['hooks/worktree.cjs', path.join(__dirname, '..', '..', '..', 'hooks', 'worktree.cjs')], ['lib/config.cjs', path.join(__dirname, '..', '..', '..', 'lib', 'config.cjs')]];
const wtCmd = (m) => `node "${path.join(wtDir, 'hooks', 'worktree.cjs').replace(/\\/g, '/')}" ${m}`;
const act = (msg, fn) => { if (apply) { fn(); done.push(msg); } else todo.push(msg); };

// 1) Copia de la statusline fuera del plugin (la ruta del plugin cambia con cada versión).
const same = fs.existsSync(dst) && fs.readFileSync(dst, 'utf8') === fs.readFileSync(src, 'utf8');
if (!same) act(`copiar la statusline a ${dst}`, () => { fs.mkdirSync(dstDir, { recursive: true }); fs.copyFileSync(src, dst); });

// 1b) Hook de worktrees fuera del plugin (misma razón que la statusline)
if (wantWt) {
  const stale = wtFiles.some(([rel, from]) => !fs.existsSync(path.join(wtDir, rel)) || fs.readFileSync(path.join(wtDir, rel), 'utf8') !== fs.readFileSync(from, 'utf8'));
  if (stale) act(`copiar el hook de worktrees a ${wtDir}`, () => { for (const [rel, from] of wtFiles) { fs.mkdirSync(path.dirname(path.join(wtDir, rel)), { recursive: true }); fs.copyFileSync(from, path.join(wtDir, rel)); } });
  const cfgFile = path.join(dstDir, 'worktrees.json');
  let cur = {}; try { cur = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { /* nuevo */ }
  if (cur.root !== wtRoot) act(`raíz de worktrees: ${wtRoot} (${cfgFile})`, () => { fs.mkdirSync(dstDir, { recursive: true }); fs.writeFileSync(cfgFile, JSON.stringify({ ...cur, root: wtRoot }, null, 2) + '\n'); });
}

// 2) settings.json del usuario
let settings = {}, readable = true;
if (fs.existsSync(settingsFile)) {
  try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8').replace(/^﻿/, '')); }
  catch { readable = false; manual.push(`${settingsFile} no es JSON válido: no lo toco. Agregá a mano: "statusLine": {"type":"command","command":${JSON.stringify(wantCmd)}}`); }
}
if (readable) {
  const next = JSON.parse(JSON.stringify(settings));
  const cur = settings.statusLine && settings.statusLine.command;
  if (!cur) next.statusLine = { type: 'command', command: wantCmd };
  else if (cur !== wantCmd) {
    if (force) next.statusLine = { ...settings.statusLine, type: 'command', command: wantCmd };
    else manual.push(`ya tenés otra statusline (${cur}). No la reemplazo: sin la de ai-env, budget-plan no tiene datos. Para reemplazarla: --apply --force-statusline`);
  }
  let wtChanged = false;
  if (wantWt) {
    next.hooks = next.hooks || {};
    for (const [ev, m] of [['WorktreeCreate', 'create'], ['WorktreeRemove', 'remove']]) {
      const list = next.hooks[ev] = next.hooks[ev] || [];
      const mine = list.some((g) => (g.hooks || []).some((h) => String(h.command || '').includes('ai-env/worktree/hooks/worktree.cjs')));
      const other = list.some((g) => (g.hooks || []).some((h) => !String(h.command || '').includes('ai-env/worktree/hooks/worktree.cjs')));
      if (other) { manual.push(`ya tenés otro hook ${ev} en tus settings: no agrego el de ai-env (dos hooks crearían dos worktrees)`); continue; }
      if (!mine) { list.push({ hooks: [{ type: 'command', command: wtCmd(m), timeout: m === 'create' ? 120 : 90 }] }); wtChanged = true; }
    }
  }
  const mk = next.extraKnownMarketplaces && next.extraKnownMarketplaces['ai-env'];
  if (mk && mk.autoUpdate !== true) mk.autoUpdate = true;
  else if (!mk) manual.push('el marketplace ai-env no figura en tus settings de usuario: si lo agregaste por proyecto, activá "autoUpdate" ahí; si no, corré: claude plugin marketplace add santiagodaros/ai-env');
  if (JSON.stringify(next) !== JSON.stringify(settings)) {
    const what = [next.statusLine !== undefined && JSON.stringify(next.statusLine) !== JSON.stringify(settings.statusLine) ? 'statusLine' : null, mk && (settings.extraKnownMarketplaces['ai-env'].autoUpdate !== true) ? 'autoUpdate del marketplace ai-env' : null, wtChanged ? 'hooks de worktrees' : null].filter(Boolean).join(' y ');
    act(`actualizar ${settingsFile} (${what}); queda una copia .bak`, () => {
      fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
      if (fs.existsSync(settingsFile)) fs.copyFileSync(settingsFile, settingsFile + '.bak');
      fs.writeFileSync(settingsFile, JSON.stringify(next, null, 2) + '\n');
    });
  }
}
const out = [];
if (apply) out.push(done.length ? 'Aplicado:\n' + done.map((t) => '- ' + t).join('\n') : 'Nada que cambiar: ya estaba configurado.');
else out.push(todo.length ? 'Haría (usá --apply):\n' + todo.map((t) => '- ' + t).join('\n') : 'Nada que cambiar: ya está configurado.');
if (manual.length) out.push('A mano:\n' + manual.map((t) => '- ' + t).join('\n'));
if (apply && done.length) out.push('Reiniciá Claude Code para que tome la statusline. El % del límite de 5 h aparece tras la primera respuesta (solo planes Pro/Max).');
console.log(out.join('\n\n'));
