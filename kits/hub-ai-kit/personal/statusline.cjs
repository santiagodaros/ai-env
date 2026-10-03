#!/usr/bin/env node
// Status line: modelo | contexto usado | límite de 5 h consumido | costo estimado de la sesión.
// Lee el JSON de la sesión por stdin e imprime una línea. Campos según la documentación de Claude Code:
// model.display_name, context_window.used_percentage, rate_limits.five_hour.used_percentage, cost.total_cost_usd
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let d = {};
  try { d = JSON.parse(raw); } catch { /* línea mínima */ }
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const parts = [];
  parts.push(`[${(d.model && d.model.display_name) || 'Claude'}]`);
  const ctx = num(d.context_window && d.context_window.used_percentage);
  if (ctx !== null) parts.push(`ctx ${Math.round(ctx)}%${ctx >= 70 ? ' ⚠ /compact o /clear' : ''}`);
  const h5 = num(d.rate_limits && d.rate_limits.five_hour && d.rate_limits.five_hour.used_percentage);
  if (h5 !== null) parts.push(`5h ${Math.round(h5)}%`);
  const cost = num(d.cost && d.cost.total_cost_usd);
  if (cost !== null) parts.push(`$${cost.toFixed(2)}`);
  process.stdout.write(parts.join(' | ') + '\n');
});
