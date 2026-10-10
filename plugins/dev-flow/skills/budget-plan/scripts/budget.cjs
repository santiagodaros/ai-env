#!/usr/bin/env node
// Presupuesto del límite de 5 h: mide cuánto consume cada feature y propone cómo ejecutar con lo que queda.
// Lee la foto que escribe la statusline (~/.claude/.budget/latest.json). Sin rate_limits (planes sin límite en la
// statusline) los comandos lo dicen y no inventan datos.
// Uso: node budget.cjs status | start <slug> | end <slug> | estimate [slug] | plan [slug] | check [slug]  [--json]
//      node budget.cjs burn [--json]                       velocidad de consumo (% del límite de 5 h por minuto)
//      node budget.cjs batch <n> --minutes <m> [--running <k>] [--per-worker <pct>] [--json]
//                                                           cuántos de n workers entran (lo usa dispatch); exit 4 = ninguno
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const argv = process.argv.slice(2);
const cmd = argv[0], slug = argv[1] && !argv[1].startsWith('--') ? argv[1] : undefined, asJson = argv.includes('--json');
const out = o => { if (asJson) console.log(JSON.stringify(o)); else console.log(o.text); };

const root = (() => { const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', shell: false }); return r.status === 0 ? r.stdout.trim() : process.cwd(); })();
const cfgFile = path.join(root, '.claude', 'budget.json');
let cfg = { reservePct: 10, safetyFactor: 0.6, staleMinutes: 15 };
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile, 'utf8')) }; } catch { /* defaults */ }
cfg.reservePct = Math.min(Math.max(Number(cfg.reservePct) || 0, 5), 50);          // nunca menos de 5 % de reserva
cfg.safetyFactor = Math.min(Math.max(Number(cfg.safetyFactor) || 0.6, 0.3), 0.8);

const budgetDir = process.env.CLAUDE_BUDGET_DIR || path.join(os.homedir(), '.claude', '.budget');
const histDir = path.join(root, '.claude', '.feature-flow');
const histFile = path.join(histDir, 'budget-history.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

function snapshot() {
  const s = readJson(path.join(budgetDir, 'latest.json'), null);
  if (!s || !s.fiveHour) return null;
  const now = Date.now();
  const reset = s.fiveHour.resetsAt && s.fiveHour.resetsAt * 1000 <= now;           // la ventana ya se reinició
  const used = reset ? 0 : s.fiveHour.pct;
  const ageMin = (now - s.at) / 60000;
  return {
    usedPct: used, freePct: Math.max(0, 100 - used), resetsAt: reset ? null : s.fiveHour.resetsAt, windowReset: !!reset,
    weekPct: s.sevenDay ? s.sevenDay.pct : null, ageMin, stale: ageMin > cfg.staleMinutes, sessionId: s.sessionId, costUsd: s.costUsd,
  };
}
// Velocidad de consumo con las muestras que guarda la statusline (una por minuto, ventana actual). La statusline
// entrega porcentaje del límite, no tokens: la unidad es % por minuto. Incluye todo lo que gasta la cuenta.
function burn(s) {
  const raw = readJson(path.join(budgetDir, 'latest.json'), null);
  if (!s) return { ok: false, reason: 'sin datos del límite de 5 h' };
  const now = Date.now();
  const all = ((raw && raw.samples) || []).filter((x) => x && typeof x.pct === 'number' && (!s.resetsAt || !x.resetsAt || x.resetsAt === s.resetsAt));
  const win = all.filter((x) => now - x.at <= 30 * 60000);
  const span = win.length ? (win[win.length - 1].at - win[0].at) / 60000 : 0;
  if (win.length < 3 || span < 10) return { ok: false, reason: `pocas muestras (${win.length} en ${Math.round(span)} min; hacen falta 3 en 10 min o más)` };
  const rate = Math.max(0, (win[win.length - 1].pct - win[0].pct) / span);
  const usable = Math.max(0, 100 - cfg.reservePct - s.usedPct);
  const toReserve = rate > 0 ? usable / rate : Infinity;
  const toReset = s.resetsAt ? Math.max(0, (s.resetsAt * 1000 - now) / 60000) : null;
  return { ok: true, ratePctPerMin: Math.round(rate * 100) / 100, samples: win.length, spanMin: Math.round(span), minutesToReserve: isFinite(toReserve) ? Math.round(toReserve) : null, minutesToReset: toReset === null ? null : Math.round(toReset), exhaustsBeforeReset: isFinite(toReserve) && toReset !== null && toReserve < toReset };
}
const burnText = (b) => (b.ok ? `Consumo: ${b.ratePctPerMin}%/min en los últimos ${b.spanMin} min.${b.minutesToReserve === null ? ' Sin consumo en ese lapso.' : ` Al ritmo actual llegás a la reserva en ~${b.minutesToReserve} min${b.minutesToReset !== null ? (b.exhaustsBeforeReset ? `, ANTES del reinicio (en ${b.minutesToReset} min)` : `, después del reinicio (en ${b.minutesToReset} min)`) : ''}.`}` : `Consumo: sin medir (${b.reason}).`);

const fmtReset = (sec) => { if (!sec) return 'sin dato de reinicio'; const m = Math.max(0, Math.round((sec * 1000 - Date.now()) / 60000)); return `en ${Math.floor(m / 60)} h ${m % 60} min`; };
const need = () => { if (!slug) { console.error('Falta el slug de la feature.'); process.exit(1); } };

const hist = () => readJson(histFile, []);
const save = h => { fs.mkdirSync(histDir, { recursive: true }); fs.writeFileSync(histFile, JSON.stringify(h.slice(-100), null, 2)); };

function estimate() {
  const v = hist().filter(e => e.endAt && e.valid && e.deltaPct >= 0).map(e => e.deltaPct).sort((a, b) => a - b);
  if (!v.length) return { n: 0, pct: null };
  const p75 = v[Math.min(v.length - 1, Math.ceil(0.75 * v.length) - 1)];
  return { n: v.length, pct: v.length >= 3 ? p75 : Math.max(...v), basis: v.length >= 3 ? 'p75' : 'máximo (muestra chica)' };
}

if (cmd === 'status') {
  const s = snapshot();
  if (!s) return out({ ok: false, text: 'Sin datos del límite de 5 h: la statusline no entregó rate_limits (solo Pro/Max, tras la primera respuesta) o no corre la statusline del kit.' });
  const b = burn(s);
  out({ ok: true, ...s, burn: b, text: `5 h: ${Math.round(s.usedPct)}% usado, ${Math.round(s.freePct)}% libre, reinicia ${fmtReset(s.resetsAt)}. ${burnText(b)}` + (s.weekPct !== null ? ` 7 d: ${Math.round(s.weekPct)}%.` : '') + (s.stale ? ` DATO VIEJO (${Math.round(s.ageMin)} min): abrí una sesión interactiva para refrescarlo.` : '') });
} else if (cmd === 'start') {
  need();
  const h = hist();
  if (h.some(e => e.slug === slug && !e.endAt)) return out({ ok: true, text: `Medición de "${slug}" ya iniciada.` });
  const s = snapshot();
  h.push({ slug, startAt: Date.now(), startPct: s ? s.usedPct : null, startResets: s ? s.resetsAt : null, note: s ? undefined : 'sin datos al iniciar' });
  save(h);
  out({ ok: true, text: `Medición de "${slug}" iniciada en ${s ? Math.round(s.usedPct) + '%' : 'sin datos'}.` });
} else if (cmd === 'end') {
  need();
  const h = hist(), e = h.find(x => x.slug === slug && !x.endAt);
  if (!e) return out({ ok: false, text: `No hay medición iniciada para "${slug}".` });
  const s = snapshot();
  e.endAt = Date.now(); e.endPct = s ? s.usedPct : null; e.endResets = s ? s.resetsAt : null;
  if (e.startPct === null || e.endPct === null) { e.valid = false; e.note = 'faltan datos'; }
  else if (e.startResets !== e.endResets) { e.valid = false; e.note = 'la ventana de 5 h se reinició durante la feature'; }
  else if (e.endPct < e.startPct) { e.valid = false; e.note = 'el porcentaje bajó'; }
  else { e.valid = true; e.deltaPct = Math.round((e.endPct - e.startPct) * 10) / 10; }
  e.note = e.note || 'incluye todo lo gastado en la misma cuenta (otras sesiones, chats y dispositivos)';
  save(h);
  out({ ok: true, slug, valid: e.valid, deltaPct: e.deltaPct, text: e.valid ? `Consumo medido de "${slug}": ${e.deltaPct}% del límite de 5 h (incluye cualquier otro uso de la cuenta en ese lapso).` : `Medición de "${slug}" no válida: ${e.note}.` });
} else if (cmd === 'estimate') {
  const e = estimate();
  out({ ok: e.pct !== null, ...e, text: e.pct === null ? 'Sin historial: aún no hay features medidas. Cerrá 1 o 2 con start/end para tener estimación.' : `Estimación: ${e.pct}% del límite de 5 h por feature (${e.basis}, ${e.n} medidas).` });
} else if (cmd === 'plan' || cmd === 'check') {
  const s = snapshot(), e = estimate();
  if (!s) return out({ status: 'sin-datos', text: 'Sin datos del límite de 5 h: no puedo calcular si alcanza. Ejecutá con un tope manual y medí con start/end.' });
  const A = s.freePct, R = cfg.reservePct, usable = Math.max(0, A - R);
  const lines = [`Disponible: ${Math.round(A)}% (reserva ${R}%, usable ${Math.round(usable)}%). Reinicio ${fmtReset(s.resetsAt)}.`];
  if (s.stale) lines.push(`Aviso: el dato tiene ${Math.round(s.ageMin)} min. Puede estar desactualizado.`);
  if (s.weekPct !== null && s.weekPct >= 85) lines.push(`Aviso: el límite de 7 días está en ${Math.round(s.weekPct)}%.`);
  let status;
  if (A < R) { status = 'sin-margen'; lines.push(`SIN MARGEN: quedan menos del ${R}% de reserva. No lances sesiones nuevas hasta el reinicio.`); }
  else if (e.pct === null) { status = 'sin-estimacion'; lines.push('Sin historial para estimar esta feature. Ejecutá y frená al llegar al 90% usado; medí con start/end para la próxima.'); }
  else {
    lines.push(`Estimación de la feature: ${e.pct}% (${e.basis}, ${e.n} medidas).`);
    const slice = usable * cfg.safetyFactor;
    if (e.pct <= slice) { status = 'alcanza'; lines.push('ALCANZA: ejecutala ahora, entra con margen.'); }
    else if (e.pct <= usable) { status = 'justo'; lines.push('JUSTO: entra pero sin margen. Ejecutala con effort bajo, /compact temprano y el subagente explorer para lecturas; frená al 90% usado.'); }
    else {
      status = 'no-alcanza';
      const k = Math.ceil(e.pct / Math.max(slice, 1));
      lines.push(`NO ALCANZA: necesita ${e.pct}% y hay ${Math.round(usable)}% usable.`);
      lines.push(`Propuesta: dividirla en ${k} rebanadas de hasta ${Math.round(slice)}% cada una (con /dev-flow:feature-flow, una feature por rebanada).`);
      lines.push(s.resetsAt ? `Hacé la primera ahora; las otras después del reinicio (${fmtReset(s.resetsAt)}).` : 'Hacé la primera ahora; las otras cuando se reinicie la ventana.');
    }
  }
  out({ status, freePct: A, usablePct: usable, estimatePct: e.pct, text: lines.join('\n') });
  if (cmd === 'check' && ['sin-margen', 'no-alcanza'].includes(status)) process.exit(4);
} else if (cmd === 'burn') {
  const s = snapshot(), b = burn(s);
  out({ ...b, text: s ? burnText(b) : 'Sin datos del límite de 5 h: la statusline no entregó rate_limits (solo Pro/Max, tras la primera respuesta).' });
} else if (cmd === 'batch') {
  // Cuántos workers de un lote entran sin pasar la reserva, y si el ritmo actual agota antes de que terminen.
  const n = Math.max(1, Number(argv[1]) || 1);
  const opt = (k, d) => { const i = argv.indexOf(k); const v = i >= 0 ? Number(argv[i + 1]) : NaN; return isFinite(v) ? v : d; };
  const minutes = Math.max(1, opt('--minutes', 15)), running = Math.max(0, opt('--running', 0)), measured = opt('--per-worker', null);
  const s = snapshot();
  if (!s) return out({ status: 'sin-datos', launchable: n, text: 'Presupuesto: sin datos del límite de 5 h (solo Pro/Max, tras la primera respuesta): se lanza sin modular.' });
  const b = burn(s);
  const usable = Math.max(0, s.freePct - cfg.reservePct);
  const per = measured !== null ? measured : b.ok && b.ratePctPerMin > 0 ? (b.ratePctPerMin / Math.max(1, running)) * minutes : null;
  const L = [`Presupuesto: ${Math.round(s.usedPct)}% usado, ${Math.round(usable)}% usable sobre la reserva del ${cfg.reservePct}%. ${burnText(b)}`];
  let k = n;
  if (usable <= 0) { k = 0; L.push('SIN MARGEN: no queda nada sobre la reserva. Esperá al reinicio.'); }
  else if (b.ok && b.exhaustsBeforeReset && b.minutesToReserve !== null && b.minutesToReserve < minutes) { k = 0; L.push(`Con el ritmo actual llegás a la reserva en ~${b.minutesToReserve} min y un worker tarda ~${Math.round(minutes)} min: no agregues carga. Esperá a que terminen los que corren o al reinicio.`); }
  else if (per !== null && per > 0) {
    k = Math.min(n, Math.floor(usable / per));
    L.push(`Cada worker: ~${Math.round(per * 10) / 10}% (${measured !== null ? 'medido en corridas anteriores' : `ritmo actual repartido en ${Math.max(1, running)} corrida(s) × ${Math.round(minutes)} min`}). Entran ${k} de ${n}.`);
    if (k === 0) L.push(`No entra ninguno sin pasar la reserva: esperá al reinicio${s.resetsAt ? ` (${fmtReset(s.resetsAt)})` : ''} o partí el ticket en rebanadas más chicas.`);
  } else L.push('Sin estimación por worker todavía: se lanza sin modular.');
  const status = k === 0 ? 'sin-margen' : k < n ? 'parcial' : 'alcanza';
  out({ status, launchable: k, requested: n, perWorkerPct: per, burn: b, usablePct: usable, text: L.join(' ') });
  if (k === 0) process.exit(4);
} else {
  console.error('Uso: budget.cjs status | start <slug> | end <slug> | estimate | plan | check | burn | batch <n> --minutes <m>  [--json]'); process.exit(1);
}
