#!/usr/bin/env node
// UserPromptSubmit: avisa al Tech Lead, en una línea por worker, qué corridas terminaron desde el último aviso.
// Así no hace falta consultar dispatch status a cada rato (los workers corren desacoplados).
// Solo lee archivos de .dev-flow/runs (no red, no procesos): es barato y corre en cada mensaje.
// No aplica a los workers (FEATURE_FLOW_CHILD). Se apaga con AI_ENV_HOOKS_SKIP=lead-notify.
const fs = require('fs');
const path = require('path');
const { run, projectDir } = require('./lib.cjs');
const config = require('../lib/config.cjs');

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

run('lead-notify', (input) => {
  if (process.env.FEATURE_FLOW_CHILD) return;
  const root = config.repoRoot(projectDir(input));
  const dir = path.join(root, '.dev-flow', 'runs');
  if (!fs.existsSync(dir)) return;
  const nf = path.join(root, '.dev-flow', 'notified.json');
  const seen = new Set(readJson(nf) || []);
  const lines = [];
  for (const id of fs.readdirSync(dir).sort()) {
    if (seen.has(id)) continue;
    const d = path.join(dir, id);
    const meta = readJson(path.join(d, 'meta.json'));
    if (!meta || Date.now() - meta.at > 3 * 86400000) { seen.add(id); continue; }
    let out = null;
    try { const raw = fs.readFileSync(path.join(d, 'out.json'), 'utf8').trim(); if (raw) out = JSON.parse(raw); } catch { /* corriendo o sin salida */ }
    const file = readJson(path.join(d, meta.role === 'auditor' ? 'verdict.json' : 'card.json'));
    let alive = false;
    if (meta.pid) { try { process.kill(meta.pid, 0); alive = true; } catch (e) { alive = e.code === 'EPERM'; } }
    if (!out && alive && (meta.mode === 'headless' || !file)) continue; // sigue corriendo (un headless puede guardar la tarjeta antes de terminar)
    const res = (out && out.structured_output) || file;
    const what = meta.role === 'auditor' ? `PR #${meta.pr}` : `#${meta.issue}`;
    let msg;
    if (res && meta.role === 'auditor') msg = `veredicto ${String(res.verdict || '?').toUpperCase()}`;
    else if (res) msg = `tarjeta lista (${(res.acceptance || []).filter((a) => a.status === 'cumple').length}/${(res.acceptance || []).length} criterios, pruebas ${res.tests && res.tests.passed ? 'pasan' : 'NO pasan'})`;
    else if (out && out.subtype) msg = `terminó con ${out.subtype}${meta.session ? ' (reanudable con dispatch resume)' : ''}`;
    else msg = 'terminó sin salida (ver dispatch status)';
    lines.push(`- ${meta.role} ${what} (${id}): ${msg}${out && out.total_cost_usd ? `, US$ ${Number(out.total_cost_usd).toFixed(2)}` : ''}${res ? ` → dispatch collect --run ${id}` : ''}`);
    seen.add(id);
  }
  try { fs.writeFileSync(nf, JSON.stringify([...seen].slice(-500))); } catch { /* sin permiso */ }
  if (lines.length) process.stdout.write(`Workers que terminaron desde tu último mensaje:\n${lines.join('\n')}\n`);
});
