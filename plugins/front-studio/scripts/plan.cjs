#!/usr/bin/env node
// Convierte hallazgos de crítica en un plan de trabajo priorizado (y opcionalmente en issues de GitHub).
// Uso: node plan.cjs <hallazgos.json>... [--out design/review/PLAN.md] [--title "Pantalla de costos"]
//                    [--issues design/review/issues] [--target ruta-a-revisar]
// Entradas: la salida --json de ai-look.cjs, a11y-scan.cjs y perf-score.cjs, y un heuristics.json escrito por la crítica
// con { tool: "nielsen", score, max: 40, items: [{ n, name, score, notes }], findings: [...] } (misma forma de hallazgo).
// Prioridad: severidad (P0 > P1 > P2) y, dentro de cada una, primero lo de menor esfuerzo (S < M < L).
// Con --issues escribe un archivo de cuerpo por paquete y los comandos `gh issue create` listos (uno por paquete, no por hallazgo).
'use strict';
const fs = require('fs');
const path = require('path');
const { args } = require('../lib/scan.cjs');

const SEV = { P0: 0, P1: 1, P2: 2 };
const EFF = { S: 0, M: 1, L: 2 };
const EFF_TXT = { S: 'menos de 1 h', M: 'medio día', L: '1 día o más' };
const AREA = { a11y: 'Accesibilidad', perf: 'Performance', 'ai-look': 'Identidad visual', nielsen: 'Usabilidad', estados: 'Estados', ux: 'Usabilidad', contenido: 'Texto de interfaz' };
const LABEL = { a11y: 'a11y', perf: 'performance', 'ai-look': 'diseño', nielsen: 'ux', estados: 'ux', ux: 'ux', contenido: 'ux' };
const PHASE = { P0: 'Fase 1 — Bloqueantes', P1: 'Fase 2 — Importantes', P2: 'Fase 3 — Pulido' };
const SCRIPT = { a11y: 'a11y-scan.cjs', perf: 'perf-score.cjs', 'ai-look': 'ai-look.cjs' };

function load(files) {
  const reports = [], findings = [];
  for (const f of files) {
    let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error(`${f}: no es JSON válido (${e.message})`); }
    const list = Array.isArray(j) ? j : j.findings || [];
    const tool = j.tool || (list[0] && list[0].source) || path.basename(f, '.json');
    if (!Array.isArray(j)) reports.push({ ...j, tool, file: f });
    for (const x of list) {
      if (!x.title || !x.severity) continue;
      findings.push({ source: x.source || tool, id: x.id || x.title.toLowerCase().replace(/\W+/g, '-').slice(0, 40), title: x.title, severity: SEV[x.severity] !== undefined ? x.severity : 'P2', where: x.where || '', evidence: x.evidence || '', fix: x.fix || '', effort: EFF[x.effort] !== undefined ? x.effort : 'M', wcag: x.wcag, accept: x.accept });
    }
  }
  // Sin duplicados: misma fuente, mismo id y mismo lugar.
  const seen = new Set();
  const uniq = findings.filter((x) => { const k = `${x.source}|${x.id}|${x.where}`; if (seen.has(k)) return false; seen.add(k); return true; });
  uniq.sort((a, b) => SEV[a.severity] - SEV[b.severity] || EFF[a.effort] - EFF[b.effort] || a.source.localeCompare(b.source));
  return { reports, findings: uniq };
}

function acceptance(x, target) {
  if (x.accept) return x.accept;
  if (SCRIPT[x.source]) return `\`node \${CLAUDE_PLUGIN_ROOT}/scripts/${SCRIPT[x.source]} ${target || '<ruta>'} --json\` ya no informa \`${x.id}\`${x.source === 'perf' && /^lab-/.test(x.id) ? ' (medido con --url, mismo perfil)' : ''}`;
  if (x.source === 'nielsen' || x.source === 'ux' || x.source === 'estados') return 'Se verifica en el preview o en la app: el caso descripto ya no ocurre y queda captura antes/después.';
  return 'Revisión manual con evidencia (captura o prueba).';
}

function packages(findings) {
  const pk = [];
  for (const sev of ['P0', 'P1', 'P2']) {
    const bySrc = {};
    for (const x of findings.filter((f) => f.severity === sev)) (bySrc[AREA[x.source] || x.source] = bySrc[AREA[x.source] || x.source] || []).push(x);
    for (const [area, items] of Object.entries(bySrc)) pk.push({ sev, area, items, label: LABEL[items[0].source] || 'ux', effort: items.reduce((a, x) => a + [1, 4, 8][EFF[x.effort]], 0) });
  }
  return pk;
}

function render({ reports, findings }, opt) {
  const title = opt.title || 'Revisión de UI';
  const date = new Date().toISOString().slice(0, 10);
  const L = [`# Plan de trabajo — ${title}`, '', `Generado el ${date} a partir de ${reports.length || 'los'} informe(s). Prioridad: severidad, y dentro de cada una primero lo más barato.`, ''];
  if (reports.length) {
    L.push('## Puntajes', '', '| Revisión | Puntaje | Base |', '|---|---|---|');
    for (const r of reports) {
      const name = { nielsen: 'Heurísticas de Nielsen', a11y: 'Accesibilidad (estática)', perf: 'Performance', 'ai-look': 'Look de IA (más bajo es mejor)' }[r.tool] || r.tool;
      L.push(`| ${name} | ${r.score ?? '—'}/${r.max ?? 100} | ${r.basis || (r.tool === 'a11y' ? 'análisis estático + lista manual' : r.tool === 'ai-look' ? r.level || '' : r.tool === 'nielsen' ? 'juicio con evidencia, 0-4 por heurística' : '')} |`);
    }
    const n = reports.find((r) => r.tool === 'nielsen');
    if (n && Array.isArray(n.items) && n.items.length) {
      L.push('', '### Heurísticas', '', '| # | Heurística | 0-4 | Nota |', '|---|---|---|---|');
      for (const it of n.items) L.push(`| ${it.n ?? ''} | ${it.name} | ${it.score} | ${(it.notes || '').replace(/\|/g, '/')} |`);
    }
    L.push('');
  }
  const counts = ['P0', 'P1', 'P2'].map((s) => `${s}: ${findings.filter((x) => x.severity === s).length}`).join(' · ');
  L.push(`## Resumen`, '', `${findings.length} hallazgo(s) — ${counts}.`, '');
  if (!findings.length) { L.push('No hay hallazgos que planificar.'); return { md: L.join('\n') + '\n', pk: [] }; }
  const quick = findings.filter((x) => x.severity !== 'P2' && x.effort === 'S').slice(0, 5);
  if (quick.length) { L.push('**Para empezar hoy** (impacto alto, menos de una hora cada uno):', ''); for (const q of quick) L.push(`- ${q.title}${q.where ? ` (${q.where.split(',')[0]})` : ''}`); L.push(''); }
  const pk = packages(findings);
  let n = 0;
  for (const sev of ['P0', 'P1', 'P2']) {
    const ps = pk.filter((p) => p.sev === sev); if (!ps.length) continue;
    L.push(`## ${PHASE[sev]}`, '');
    for (const p of ps) {
      p.n = ++n;
      L.push(`### ${p.n}. ${p.area} (${p.items.length} tarea${p.items.length > 1 ? 's' : ''}, ~${p.effort} h)`, '');
      for (const x of p.items) {
        L.push(`- [ ] **${x.title}**${x.wcag ? ` · WCAG ${x.wcag}` : ''} · esfuerzo ${x.effort} (${EFF_TXT[x.effort]})`);
        if (x.where) L.push(`  - Dónde: ${x.where}`);
        if (x.evidence) L.push(`  - Evidencia: ${x.evidence}`);
        if (x.fix) L.push(`  - Cambio: ${x.fix}`);
        L.push(`  - Hecho cuando: ${acceptance(x, opt.target)}`);
      }
      L.push('');
    }
  }
  L.push('## Cómo verificar el plan completo', '', 'Repetir las mismas revisiones y comparar puntajes con la tabla de arriba (`${CLAUDE_PLUGIN_ROOT}` es la carpeta del plugin front-studio; Claude la resuelve sola):', '', '```', `node \${CLAUDE_PLUGIN_ROOT}/scripts/a11y-scan.cjs ${opt.target || '<ruta>'} --out design/review/a11y.json`, `node \${CLAUDE_PLUGIN_ROOT}/scripts/perf-score.cjs ${opt.build || '<build o index.html>'} --url <url> --out design/review/perf.json`, `node \${CLAUDE_PLUGIN_ROOT}/scripts/ai-look.cjs ${opt.target || '<ruta>'} --out design/review/ai-look.json`, '```', '', 'Las heurísticas se vuelven a puntuar con capturas nuevas (antes/después).');
  return { md: L.join('\n') + '\n', pk };
}

function writeIssues(pk, dir, title) {
  fs.mkdirSync(dir, { recursive: true });
  const cmds = [];
  for (const p of pk) {
    const slug = `${String(p.n).padStart(2, '0')}-${p.sev.toLowerCase()}-${p.area.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\W+/g, '-')}`;
    const body = [`Paquete ${p.n} del plan de trabajo de UI (${title}). Prioridad ${p.sev}, esfuerzo estimado ~${p.effort} h.`, '', '## Tareas', '', ...p.items.flatMap((x) => [`- [ ] ${x.title}${x.where ? ` — ${x.where}` : ''}`, ...(x.fix ? [`  - Cambio: ${x.fix}`] : [])]), '', '## Criterio de aceptación', '', ...p.items.map((x) => `- ${acceptance(x, '<ruta>')}`), '', '## Fuera de alcance', '', '- Cambios de diseño que no estén en esta lista.'].join('\n') + '\n';
    const file = path.join(dir, `${slug}.md`);
    fs.writeFileSync(file, body);
    const t = `[UI ${p.sev}] ${p.area}: ${p.items.length === 1 ? p.items[0].title : `${p.items.length} tareas`}`.replace(/"/g, "'");
    cmds.push(`gh issue create --title "${t}" --body-file "${file.split(path.sep).join('/')}" --label "ui" --label "${p.label}" --label "${p.sev}"`);
  }
  const all = path.join(dir, 'crear-issues.txt');
  fs.writeFileSync(all, ['# Crear las etiquetas una vez (si faltan):', 'gh label create ui --force', 'gh label create a11y --force', 'gh label create performance --force', 'gh label create diseño --force', 'gh label create ux --force', 'gh label create P0 --force', 'gh label create P1 --force', 'gh label create P2 --force', '', '# Un issue por paquete:', ...cmds, ''].join('\n'));
  return { cmds, file: all };
}

if (require.main === module) {
  const { pos, opt } = args(process.argv.slice(2));
  if (!pos.length) { console.error('Uso: node plan.cjs <hallazgos.json>... [--out PLAN.md] [--title "..."] [--issues carpeta] [--target ruta]'); process.exit(2); }
  let data;
  try { data = load(pos); } catch (e) { console.error(e.message); process.exit(2); }
  const { md, pk } = render(data, opt);
  if (opt.out) { fs.mkdirSync(path.dirname(path.resolve(opt.out)), { recursive: true }); fs.writeFileSync(opt.out, md); console.log(`Plan escrito en ${opt.out}: ${data.findings.length} hallazgo(s) en ${pk.length} paquete(s).`); }
  else process.stdout.write(md);
  if (opt.issues && pk.length) { const r = writeIssues(pk, opt.issues, opt.title || 'Revisión de UI'); console.log(`Cuerpos de issues en ${opt.issues}/ y comandos en ${r.file} (${r.cmds.length} issue(s)). Revisalos antes de crearlos.`); }
}

module.exports = { load, render, packages };
