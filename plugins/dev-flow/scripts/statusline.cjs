#!/usr/bin/env node
// Status line: modelo | contexto | límite de 5 h (y cuánto falta para el reinicio) | límite de 7 d | costo de la sesión.
// Además guarda una foto del consumo en ~/.claude/.budget/latest.json: la statusline es el único lugar donde
// Claude Code entrega rate_limits (solo Pro/Max, tras la primera respuesta); los demás scripts la leen de ahí.
// Campos según la documentación: model.display_name, context_window.used_percentage,
// rate_limits.{five_hour,seven_day}.{used_percentage,resets_at}, cost.total_cost_usd, session_id.
const fs = require('fs'), os = require('os'), path = require('path');
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let d = {};
  try { d = JSON.parse(raw); } catch { /* línea mínima */ }
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const win = (k) => {
    const w = d.rate_limits && d.rate_limits[k];
    const pct = num(w && w.used_percentage);
    return pct === null ? null : { pct, resetsAt: num(w.resets_at) };
  };
  const h5 = win('five_hour'), d7 = win('seven_day');
  const cost = num(d.cost && d.cost.total_cost_usd);

  // Foto del consumo (mejor esfuerzo: si falla, la línea se imprime igual)
  if (h5 || d7) {
    try {
      const dir = process.env.CLAUDE_BUDGET_DIR || path.join(os.homedir(), '.claude', '.budget');
      fs.mkdirSync(dir, { recursive: true });
      const now = Date.now();
      // Muestras del límite de 5 h para medir la velocidad de consumo (burn-rate): como mucho una por minuto,
      // las últimas 60, y solo de la ventana actual (si resets_at cambió, la ventana se reinició).
      let prev = []; try { prev = JSON.parse(fs.readFileSync(path.join(dir, 'latest.json'), 'utf8')).samples || []; } catch { /* primera vez */ }
      let samples = Array.isArray(prev) ? prev.filter((x) => x && typeof x.pct === 'number' && typeof x.at === 'number' && now - x.at < 5 * 3600000 && (!h5 || !h5.resetsAt || !x.resetsAt || x.resetsAt === h5.resetsAt)) : [];
      if (h5 && (!samples.length || now - samples[samples.length - 1].at >= 60000)) samples.push({ at: now, pct: h5.pct, resetsAt: h5.resetsAt || null });
      samples = samples.slice(-60);
      const snap = { at: now, sessionId: d.session_id || null, model: (d.model && d.model.display_name) || null, fiveHour: h5, sevenDay: d7, costUsd: cost, samples };
      const tmp = path.join(dir, `latest.${process.pid}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify(snap));
      fs.renameSync(tmp, path.join(dir, 'latest.json'));
    } catch { /* sin foto */ }
  }

  const parts = [`[${(d.model && d.model.display_name) || 'Claude'}]`];
  const ctx = num(d.context_window && d.context_window.used_percentage);
  if (ctx !== null) parts.push(`ctx ${Math.round(ctx)}%${ctx >= 70 ? ' ⚠ /compact o /clear' : ''}`);
  if (h5) {
    let t = '';
    if (h5.resetsAt) { const m = Math.max(0, Math.round((h5.resetsAt * 1000 - Date.now()) / 60000)); t = ` (reinicia en ${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')})`; }
    parts.push(`5h ${Math.round(h5.pct)}%${t}`);
  }
  if (d7) parts.push(`7d ${Math.round(d7.pct)}%`);
  if (cost !== null) parts.push(`$${cost.toFixed(2)}`);
  process.stdout.write(parts.join(' | ') + '\n');
});
