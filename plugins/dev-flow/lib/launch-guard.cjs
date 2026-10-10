// Límites duros para abrir sesiones de Claude Code (features con launch.cjs y workers con dispatch.cjs).
// Un solo registro y un solo cupo para los dos: no se puede duplicar el gasto lanzando por dos caminos.
// La configuración (.claude/dev-flow.json → "launch", o el viejo .claude/feature-flow.json) puede bajar los topes,
// nunca subirlos por encima de CEIL.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const config = require('./config.cjs');

const CEIL = { maxConcurrent: 4, maxPerDay: 20, minCooldownMinutes: 2 };
const DAY = 24 * 3600 * 1000;

function limits(root) {
  const l = config.load(root).launch || {};
  return {
    maxConcurrent: Math.min(Math.max(Number(l.maxConcurrent) || 0, 0), CEIL.maxConcurrent),
    maxPerDay: Math.min(Math.max(Number(l.maxPerDay) || 0, 0), CEIL.maxPerDay),
    cooldown: Math.max(Number(l.cooldownMinutes) || 0, CEIL.minCooldownMinutes),
  };
}

const regFile = (root) => path.join(root, '.claude', '.feature-flow', 'launches.json');
function readReg(root) { try { const r = JSON.parse(fs.readFileSync(regFile(root), 'utf8')); return Array.isArray(r) ? r : []; } catch { return []; } }
function record(root, entry) {
  const reg = readReg(root);
  reg.push({ ...entry, at: entry.at || Date.now() });
  fs.mkdirSync(path.dirname(regFile(root)), { recursive: true });
  fs.writeFileSync(regFile(root), JSON.stringify(reg.slice(-100), null, 2));
}
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// Sesiones en segundo plano (claude agents) + workers headless vivos del registro. Falla cerrado.
function running(root, claudeCmd) {
  const [cmd, ...pre] = claudeCmd;
  const ag = spawnSync(cmd, [...pre, 'agents', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' && /\.cmd$|^claude$/i.test(cmd), windowsHide: true });
  let list;
  try { list = JSON.parse(ag.stdout); if (!Array.isArray(list)) throw new Error('no es lista'); }
  catch { throw new Error('no pude contar las sesiones activas (claude agents --json). Por seguridad no lanzo.'); }
  const bg = list.filter((s) => s && s.kind && s.kind !== 'interactive').length;
  const headless = readReg(root).filter((r) => r.mode === 'headless' && alive(r.pid)).length;
  return { bg, headless, total: bg + headless };
}

// Devuelve { ok, msg, info }. key = identificador de lo que se lanza (slug o rol-ticket) para no repetirlo en 24 h.
function check(root, key, claudeCmd, { repeatHours = 24 } = {}) {
  const lim = limits(root);
  let run;
  try { run = running(root, claudeCmd); } catch (e) { return { ok: false, msg: e.message }; }
  const info = { ...lim, running: run };
  if (run.total >= lim.maxConcurrent) return { ok: false, info, msg: `ya hay ${run.total} sesión(es) en segundo plano (tope ${lim.maxConcurrent}). Terminá o cerrá una con claude agents.` };
  const reg = readReg(root);
  const now = Date.now();
  // Ventana móvil de 24 h, no día calendario: si no, el tope se reinicia a medianoche y se duplica en minutos.
  info.today = reg.filter((r) => now - r.at < DAY).length;
  if (info.today >= lim.maxPerDay) return { ok: false, info, msg: `ya lanzaste ${info.today} sesión(es) en las últimas 24 h (tope ${lim.maxPerDay}).` };
  const last = reg.length ? Math.max(...reg.map((r) => r.at)) : 0;
  if (now - last < lim.cooldown * 60000) return { ok: false, info, msg: `esperá ${Math.ceil((lim.cooldown * 60000 - (now - last)) / 60000)} min desde el último lanzamiento (espera mínima ${lim.cooldown} min).` };
  if (reg.some((r) => (r.key || r.slug) === key && now - r.at < repeatHours * 3600000)) return { ok: false, info, msg: `"${key}" ya se lanzó en las últimas ${repeatHours} h. Retomalo con claude attach o claude -w.` };
  return { ok: true, info };
}

// Presupuesto del límite de 5 h (si hay datos). status 4 = sin margen.
function budget(root, slug) {
  const bp = path.join(__dirname, '..', 'skills', 'budget-plan', 'scripts', 'budget.cjs');
  if (!fs.existsSync(bp)) return { ok: true, text: 'Presupuesto: sin datos del límite de 5 h.' };
  const b = spawnSync(process.execPath, [bp, 'check', slug, '--json'], { cwd: root, encoding: 'utf8' });
  let text = 'Presupuesto: sin datos del límite de 5 h.';
  try { text = 'Presupuesto: ' + JSON.parse(b.stdout).text.replace(/\n/g, ' '); } catch { /* sin datos */ }
  return { ok: b.status !== 4, text };
}

module.exports = { CEIL, limits, check, record, readReg, budget, alive, running };
